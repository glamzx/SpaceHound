# SpaceHound &mdash; Space Without Waste

🚀 **Live Interactive Demo:** [https://glamzx.github.io/SpaceHound/](https://glamzx.github.io/SpaceHound/)

SpaceHound is an advanced mission intelligence platform for the new space economy. The application helps satellite operators, investors, and insurers reduce risk and minimize space debris by analyzing pre-launch mission blueprints using AI, estimating collision probabilities, and actively modeling LEO satellite density using live TLE data.

## Key Features
- **AI-Powered Risk Analysis**: Upload a `.pdf` or `.txt` mission proposal and our Gemini integration instantly parses orbital parameters to compute overall risk, subsystem failure probabilities, and orbital debris exposure.
- **3D Satellite Density Viewer**: Real-time rendering of active LEO satellites powered by CelesTrak TLE feeds and SGP4 orbital propagation algorithms, visualized in a high-performance WebGL environment.
- **Dynamic Risk Charting**: Visually models the correlation between payload operating altitude, inclination constraints, and failure rate.

### Example Mission Data (For Risk Analysis)
To test the AI risk analysis, you can save the following text into a `.txt` file and upload it on the **Analysis** page:

```text
Mission Data Satellite

Satellite Name: Orbita-X1
Mission Type: Earth Observation
Launch Date: 20.12.2028
Launch Site: Baikonur Cosmodrome, Kazakhstan
Operator: AstroTech Space
Manufacturer: AstroTech Industries
Orbit Type: Low Earth Orbit (LEO)
Altitude: 400 km
Inclination: 51.6°
Orbital Period: 92 minutes
Mission Duration: 5 years
Mass: 480 kg
Power Supply: Solar Panels + Lithium-Ion Battery
Payload: Multispectral Camera, Thermal Sensor, Communication Module
Communication Frequency: X-Band / S-Band
Data Transmission Rate: 250 Mbps
Coverage Area: Central Asia and nearby regions
Average Revisit Time: 12 hours
Status: Planned
Purpose: Monitoring weather, land use, and environmental changes
```

---

## 🛠 How to Launch Locally

If you prefer to run the full application (both the 3D frontend and the AI Python backend) on your local machine, follow the steps below.

### Prerequisites
- Python 3.8+ installed on your system.
- A free **Google Gemini API Key** (Get one from [Google AI Studio](https://aistudio.google.com/)).

### 1. Start the Backend Server (FastAPI)
The backend requires a few Python data science and server libraries, as well as the official Google SDK.

```bash
# Clone the repository and navigate into it
git clone https://github.com/glamzx/SpaceHound.git
cd SpaceHound

# Navigate to the backend directory
cd backend

# Create a virtual environment (optional but recommended)
python3 -m venv .venv
source .venv/bin/activate

# Install required dependencies
pip install -r requirements.txt

# Export your Gemini API key so the server can use it
export GEMINI_API_KEY="your_actual_gemini_api_key_here"

# Start the uvicorn server
uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```
The backed API will now be running at `http://127.0.0.1:8000`. 

### 2. Configure the Frontend
Because you are running the API locally, you need to tell the frontend website to talk to your local computer instead of the live public Render server.

1. Open `frontend/main.js` in your code editor.
2. At the very top (Line 5), temporarily change `API_BASE` to point to localhost:
```javascript
const API_BASE = "http://127.0.0.1:8000";
```

### 3. Start the Frontend Server
Open a new terminal window, navigate back to the root `SpaceHound` folder, and serve the `frontend/` directory using Python's built in HTTP server:

```bash
cd SpaceHound
python3 -m http.server 5500 -d frontend
```

### 4. Visit the Application
Open your web browser and go to:
**[http://localhost:5500](http://localhost:5500)**

Navigate to the **Analysis** tab to test out the full AI pipeline and 3D globe rendering!
