import requests
import xml.etree.ElementTree as ET

NASA_BASE = "https://ghrc.nsstc.nasa.gov/services/satellites/elements.pl"
CELESTRAK_TLE = "https://celestrak.org/NORAD/elements/gp.php"

def _get_tle_from_nasa(satid: int, timeout: int = 10):
    r = requests.get(NASA_BASE, params={"satid": satid}, timeout=timeout)
    r.raise_for_status()
    root = ET.fromstring(r.text)
    element = root.find("element")
    if element is None:
        raise RuntimeError("NASA: no element in response")
    l1 = element.attrib.get("one")
    l2 = element.attrib.get("two")
    if not l1 or not l2:
        raise RuntimeError("NASA: invalid TLE")
    return l1, l2

def _get_tle_from_celestrak(norad_cat_id: int, timeout: int = 10):
    # format=tle -> вернёт 2 строки TLE (иногда с названием первой строкой)
    r = requests.get(
        CELESTRAK_TLE,
        params={"CATNR": str(norad_cat_id), "FORMAT": "TLE"},
        timeout=timeout
    )
    r.raise_for_status()
    text = r.text.strip().splitlines()

    # иногда: 3 строки (name + line1 + line2), иногда 2 строки
    if len(text) >= 3 and text[1].startswith("1 ") and text[2].startswith("2 "):
        return text[1].strip(), text[2].strip()
    if len(text) >= 2 and text[0].startswith("1 ") and text[1].startswith("2 "):
        return text[0].strip(), text[1].strip()

    raise RuntimeError(f"CelesTrak: unexpected response: {r.text[:200]}")

def get_tle(satid: int):
    # 1) пробуем NASA
    try:
        return _get_tle_from_nasa(satid)
    except Exception:
        # 2) fallback на CelesTrak
        return _get_tle_from_celestrak(satid)
