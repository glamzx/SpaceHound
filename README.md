# SpaceHound (Frontend + FastAPI)

## Run locally
### Backend
```bash
cd backend
python -m venv .venv
# activate venv
pip install -r requirements.txt
uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

### Frontend
Open `frontend/index.html` (or serve with any static server).

## Configure API URL (for GitHub Pages)
After deploying the backend to Render/Railway, set the API base URL in the browser:
```js
localStorage.setItem("SPACEHOUND_API", "https://YOUR-BACKEND-URL")
location.reload()
```

## API
- POST `/recommend_orbit` (supports both JSON body and query params)
- GET `/health`
- GET `/docs`
