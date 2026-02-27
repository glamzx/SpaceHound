import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
import joblib

data = pd.DataFrame({
    "altitude": np.random.uniform(400,800,1000),
    "inclination": np.random.uniform(0,120,1000),
    "congestion": np.random.uniform(0,1,1000),
    "relative_velocity": np.random.uniform(7,8,1000),
})

data["risk"] = (
    data["congestion"]*0.6 +
    abs(data["inclination"]-98)*0.002 +
    abs(data["altitude"]-550)*0.001 +
    data["relative_velocity"]*0.05
)

X = data[["altitude","inclination","congestion","relative_velocity"]]
y = data["risk"]

model = RandomForestRegressor()
model.fit(X,y)

joblib.dump(model,"orbit_model.pkl")

print("Orbit Recommendation Model Trained")

