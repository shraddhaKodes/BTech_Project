from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class PredictionRequest(BaseModel):
    values: list[float]


@app.get("/")
def root():
    return {"message": "ML Service is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/predict")
def predict(request: PredictionRequest):
    # Temporary dummy prediction
    prediction = request.values[-1]

    return {
        "prediction": prediction
    }