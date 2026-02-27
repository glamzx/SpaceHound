from __future__ import annotations

import io
import math
import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from fastapi import Body, FastAPI, Query, UploadFile, File
import tempfile
import json
from google import genai

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, confloat

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


app = FastAPI(title="SpaceHound API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


MODEL_PATH = os.getenv("MODEL_PATH", "orbit_model.pkl")
model = joblib.load(MODEL_PATH)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyC41xj0Z_i08RraM7KmY4GnSgDEsp_Kkww")
genai_client = genai.Client(api_key=GEMINI_API_KEY)



from pydantic import BaseModel, Field
from typing import Optional

class OrbitRequest(BaseModel):
    altitude: float = Field(..., gt=0, description="Altitude in km")
    inclination: float = Field(..., ge=0, le=180, description="Inclination in degrees")
    launch_date: Optional[str] = Field(None, description="Optional launch date (YYYY-MM-DD)")
    mission_days: Optional[int] = Field(None, ge=1, le=3650, description="Optional mission duration (days)")


def _gaussian(x: float, mu: float, sigma: float) -> float:
    return math.exp(-0.5 * ((x - mu) / sigma) ** 2)


def calculate_congestion(altitude_km: float, inclination_deg: float) -> float:
    base = 0.18

    peak_550 = 0.65 * _gaussian(altitude_km, 550, 35)
    peak_600 = 0.30 * _gaussian(altitude_km, 600, 40)
    peak_450 = 0.15 * _gaussian(altitude_km, 450, 45)

    sso_boost = 0.0
    if abs(inclination_deg - 97.5) <= 2.0:
        sso_boost = 0.18
    elif abs(inclination_deg - 53.0) <= 2.0:
        sso_boost = 0.10

    congestion = base + peak_550 + peak_600 + peak_450 + sso_boost
    return float(max(0.0, min(1.0, congestion)))


def estimate_relative_velocity(altitude_km: float, inclination_deg: float) -> float:
    base = 7.45
    inc_term = 0.0045 * abs(inclination_deg - 98.0)
    alt_term = 0.0009 * abs(altitude_km - 550.0)
    v = base + inc_term + alt_term
    return float(max(7.0, min(8.2, v)))


def _model_predict_raw(altitude_km: float, inclination_deg: float) -> Tuple[float, Dict[str, float]]:
    congestion = calculate_congestion(altitude_km, inclination_deg)
    rel_vel = estimate_relative_velocity(altitude_km, inclination_deg)

    df = pd.DataFrame([{
        "altitude": float(altitude_km),
        "inclination": float(inclination_deg),
        "congestion": float(congestion),
        "relative_velocity": float(rel_vel),
    }])

    raw: float
    if hasattr(model, "predict_proba"):
        raw = float(model.predict_proba(df)[0][1])
    elif hasattr(model, "decision_function"):
        raw = float(model.decision_function(df)[0])
    else:
        raw = float(model.predict(df)[0])

    return raw, {"congestion": float(congestion), "relative_velocity": float(rel_vel)}


def normalize_risk(raw: float) -> float:
    if 0.0 <= raw <= 1.0:
        return float(raw)

    if -10.0 <= raw <= 10.0:
        return float(1.0 / (1.0 + math.exp(-raw)))

    lo, hi = 0.25, 1.35
    norm = (raw - lo) / (hi - lo)
    return float(max(0.0, min(1.0, norm)))


def risk_level(score01: float) -> str:
    if score01 < 0.33:
        return "LOW"
    if score01 < 0.66:
        return "MEDIUM"
    return "HIGH"


def build_reasons(altitude_km: float, inclination_deg: float, feats: Dict[str, float], score01: float) -> List[str]:
    reasons: List[str] = []
    cong = feats["congestion"]
    relv = feats["relative_velocity"]

    if cong >= 0.75:
        reasons.append("Высокая орбитальная загруженность в выбранной высотной оболочке.")
    elif cong >= 0.50:
        reasons.append("Орбитальная загруженность выше среднего на этой высоте.")

    if 530 <= altitude_km <= 580:
        reasons.append("Высота находится близко к плотной LEO-оболочке (~550 км), где много активных спутников.")
    if 590 <= altitude_km <= 640:
        reasons.append("Диапазон 600–640 км часто имеет пересекающийся трафик и среднюю/высокую плотность миссий.")

    if abs(inclination_deg - 97.5) <= 2.0:
        reasons.append("Наклонение близко к SSO (97–99°): такие орбиты часто пересекаются и перегружены.")
    elif abs(inclination_deg - 53.0) <= 2.0:
        reasons.append("Наклонение близко к популярной плоскости (~53°), что повышает вероятность пересечений.")

    if relv >= 7.9:
        reasons.append("Оценочная относительная скорость повышенная: пересекающиеся траектории дают более рискованные сближения.")
    elif relv >= 7.7:
        reasons.append("Оценочная относительная скорость чуть выше среднего, что увеличивает риск при высокой плотности.")

    if not reasons and score01 >= 0.66:
        reasons.append("Комбинация параметров создаёт повышенную вероятность пересечений с другими орбитальными плоскостями.")

    return reasons[:3]


def build_recommendation_text(
    altitude_km: float,
    inclination_deg: float,
    feats: Dict[str, float],
    score01: float,
    best: Dict[str, Any],
) -> str:
    cong = feats["congestion"]
    relv = feats["relative_velocity"]
    lvl = risk_level(score01)

    if lvl == "LOW":
        return (
            "Риск низкий. Орбита выглядит приемлемой. "
            "Рекомендуется всё равно включить мониторинг сближений (conjunction screening) "
            "и заложить небольшой манёвренный запас на миссию."
        )

    if lvl == "MEDIUM":
        tips = []
        if cong >= 0.5:
            tips.append("сдвинуть высоту на 20–60 км в менее загруженную оболочку")
        if abs(inclination_deg - 97.5) <= 2.0:
            tips.append("избегать точного попадания в SSO-центр (попробовать ±0.5–1.5°)")
        if relv >= 7.7:
            tips.append("уменьшить пересечения плоскостей за счёт небольшого изменения наклонения")
        if not tips:
            tips.append("провести локальную оптимизацию высоты/наклонения вблизи текущих значений")
        return (
            "Риск средний. Орбита возможна, но желательно снизить риск. "
            f"Лучший шаг: {', '.join(tips[:2])}. "
            f"По оценке системы, более безопасный вариант сейчас: {best['altitude']} км / {best['inclination']}°."
        )

    actions = []
    if cong >= 0.75 or (530 <= altitude_km <= 580):
        actions.append("изменить высоту на 30–100 км, чтобы уйти из плотной оболочки")
    if abs(inclination_deg - 97.5) <= 2.0 or abs(inclination_deg - 53.0) <= 2.0:
        actions.append("скорректировать наклонение на 0.5–2° для уменьшения пересечений")
    if relv >= 7.9:
        actions.append("предпочесть параметры с меньшей относительной скоростью (меньше crossing traffic)")

    if not actions:
        actions.append("пересмотреть параметры орбиты и выполнить расширенный поиск безопасных сочетаний")

    return (
        "Риск высокий. Рекомендуется НЕ фиксировать текущую орбиту как финальную без корректировок. "
        f"Рекомендуемые действия: {', '.join(actions[:3])}. "
        f"Более безопасный вариант по расчёту: {best['altitude']} км / {best['inclination']}° "
        f"(нормализованный риск {best['risk_score']*100:.1f}%). "
        "Если параметры менять нельзя — обязательно заложите активный мониторинг сближений и манёвренный бюджет."
    )


def _diverse_top_k(sorted_items: List[Dict[str, Any]], k: int = 3) -> List[Dict[str, Any]]:
    picked: List[Dict[str, Any]] = []
    for item in sorted_items:
        ok = True
        for p in picked:
            if abs(item["altitude"] - p["altitude"]) < 10 and abs(item["inclination"] - p["inclination"]) < 0.3:
                ok = False
                break
        if ok:
            picked.append(item)
        if len(picked) >= k:
            break
    return picked


def generate_candidate_grid(altitude: float, inclination: float) -> List[Tuple[float, float]]:
    alts = [altitude + d for d in range(-80, 81, 10)]
    incs = [inclination + d for d in np.arange(-3.0, 3.01, 0.5)]
    grid = []
    for a in alts:
        if a < 180 or a > 2000:
            continue
        for i in incs:
            if 0 <= i <= 180:
                grid.append((float(a), float(i)))
    return grid


def score_option(alt: float, inc: float) -> Dict[str, Any]:
    raw, feats = _model_predict_raw(alt, inc)
    score01 = normalize_risk(raw)
    note_parts = []
    if feats["congestion"] < 0.45:
        note_parts.append("нижняя загруженность")
    if feats["relative_velocity"] < 7.65:
        note_parts.append("меньше crossing-трафика")
    note = ", ".join(note_parts) if note_parts else "оптимизированный вариант"

    return {
        "altitude": round(float(alt), 2),
        "inclination": round(float(inc), 2),
        "risk_score": round(float(score01), 4),
        "note": note,
        "factors": {k: round(float(v), 4) for k, v in feats.items()},
    }


@app.get("/")
def root():
    return {"message": "SpaceHound Orbit Recommendation AI Running", "model_path": MODEL_PATH}


@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.post("/recommend_orbit")
def recommend_orbit(
    payload: Optional[OrbitRequest] = Body(default=None),
    altitude: Optional[float] = Query(default=None),
    inclination: Optional[float] = Query(default=None),
    launch_date: Optional[str] = Query(default=None),
    mission_days: Optional[int] = Query(default=None),
):
    if payload is not None:
        altitude = float(payload.altitude)
        inclination = float(payload.inclination)
        launch_date = payload.launch_date
        mission_days = payload.mission_days

    if altitude is None or inclination is None:
        return {"error": "altitude and inclination are required (JSON body or query params)"}

    raw0, feats0 = _model_predict_raw(altitude, inclination)
    score0 = normalize_risk(raw0)

    candidates = [score_option(a, i) for (a, i) in generate_candidate_grid(altitude, inclination)]
    candidates_sorted = sorted(candidates, key=lambda x: x["risk_score"])
    top = _diverse_top_k(candidates_sorted, k=3)

    best = top[0]
    reasons = build_reasons(altitude, inclination, feats0, score0)
    recommendation = build_recommendation_text(altitude, inclination, feats0, score0, best)

    return {
        "input": {
            "altitude": round(float(altitude), 2),
            "inclination": round(float(inclination), 2),
            "launch_date": launch_date,
            "mission_days": mission_days,
        },
        "risk_score": round(float(score0), 4),
        "risk_level": risk_level(score0),
        "main_reasons": reasons,
        "recommendation_text": recommendation,
        "best_option": best,
        "second_option": top[1] if len(top) > 1 else None,
        "third_option": top[2] if len(top) > 2 else None,
        "top_options": top,
    }


@app.get("/risk_curve")
def risk_curve(
    inclination: float = Query(...),
    alt_min: int = Query(200),
    alt_max: int = Query(1200),
    step: int = Query(20),
):
    points = []
    for alt in range(int(alt_min), int(alt_max) + 1, int(step)):
        raw, _feats = _model_predict_raw(float(alt), float(inclination))
        r = normalize_risk(raw)
        points.append({"altitude": alt, "risk": round(float(r), 4)})
    return {"inclination": inclination, "points": points}


@app.get("/density")
def density(
    n: int = Query(800),
    alt_min: int = Query(300),
    alt_max: int = Query(900),
):
    import random

    points = []
    for _ in range(n):
        band = random.choice([45, 53, 97, 98, 120])
        lat = random.gauss(0, band / 2)
        lon = random.uniform(-180, 180)
        alt = random.uniform(alt_min, alt_max)
        points.append({"lat": round(lat, 3), "lon": round(lon, 3), "altitude": round(alt, 1)})

    return {"count": n, "points": points}


@app.post("/report.pdf")
def generate_pdf(
    payload: Optional[OrbitRequest] = Body(default=None),
    altitude: Optional[float] = Query(default=None),
    inclination: Optional[float] = Query(default=None),
    launch_date: Optional[str] = Query(default=None),
    mission_days: Optional[int] = Query(default=None),
):
    if payload is not None:
        altitude = float(payload.altitude)
        inclination = float(payload.inclination)
        launch_date = payload.launch_date
        mission_days = payload.mission_days

    if altitude is None or inclination is None:
        return {"error": "altitude and inclination are required"}

    rec = recommend_orbit(altitude=altitude, inclination=inclination, launch_date=launch_date, mission_days=mission_days)
    best = rec["best_option"]
    risk_percent = float(rec["risk_score"]) * 100.0

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    c.setFont("Helvetica-Bold", 18)
    c.drawString(40, height - 60, "SpaceHound Mission Risk Report")

    c.setFont("Helvetica", 10)
    c.drawString(40, height - 80, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, height - 120, "Mission Parameters")

    c.setFont("Helvetica", 11)
    c.drawString(40, height - 140, f"Altitude: {altitude} km")
    c.drawString(40, height - 158, f"Inclination: {inclination} deg")
    c.drawString(40, height - 176, f"Launch Date: {launch_date or '-'}")
    c.drawString(40, height - 194, f"Mission Duration: {mission_days or '-'} days")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, height - 230, "AI Risk Assessment")

    c.setFont("Helvetica", 11)
    c.drawString(40, height - 250, f"Predicted Collision Risk (normalized): {risk_percent:.2f}%")
    c.drawString(40, height - 270, f"Risk Level: {rec['risk_level']}")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, height - 305, "Recommendation")
    c.setFont("Helvetica", 10)
    text = c.beginText(40, height - 325)
    text.setLeading(14)
    for line in rec["recommendation_text"].split(". "):
        text.textLine(line.strip() if line.endswith(".") else (line.strip() + "."))
    c.drawText(text)

    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, height - 470, "Top Orbit Options")
    c.setFont("Helvetica", 11)
    y = height - 490
    for idx, opt in enumerate(rec["top_options"], start=1):
        c.drawString(40, y, f"{idx}) {opt['altitude']} km | {opt['inclination']}° | Risk: {opt['risk_score']}")
        y -= 18

    c.showPage()
    c.save()

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=spacehound_report.pdf"},
    )



@app.post("/analyze_mission_file")
async def analyze_mission_file(file: UploadFile = File(...)):
    if not genai_client:
        return {"error": "Gemini API client not initialized"}
        
    ext = os.path.splitext(file.filename)[1]
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        uploaded_file = genai_client.files.upload(file=tmp_path)
        
        prompt = (
            "Analyze this satellite mission document. Extract the planned orbit parameters. "
            "Return ONLY a valid JSON object with exactly two keys: 'altitude' (in km, as a float) "
            "and 'inclination' (in degrees, as a float). Do not include markdown code block formatting or any extra text. "
            "If you cannot find an exact number, make a best guess based on the orbit type (e.g. SSO -> ~97.5 inc, ~550 alt). "
            "Example output: {\"altitude\": 550.0, \"inclination\": 97.5}"
        )
        
        result = genai_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[uploaded_file, prompt]
        )
        
        genai_client.files.delete(name=uploaded_file.name)
        
        text = result.text.strip()
        if text.startswith('```json'):
            text = text[7:]
        if text.endswith('```'):
            text = text[:-3]
            
        data = json.loads(text.strip())
        return data
        
    except Exception as e:
        return {"error": str(e)}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
