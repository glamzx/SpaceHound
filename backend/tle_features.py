from sgp4.api import Satrec
import numpy as np

def extract_features(line1, line2):

    sat = Satrec.twoline2rv(line1, line2)

    inclination = sat.inclo * 180/np.pi
    eccentricity = sat.ecco
    mean_motion = sat.no_kozai

    return {
        "inclination": inclination,
        "eccentricity": eccentricity,
        "mean_motion": mean_motion
    }