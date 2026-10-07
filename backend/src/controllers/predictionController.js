import { predict } from "../services/mlService.js";

const validateValues = (values) => {
  if (!Array.isArray(values)) {
    return "values must be an array.";
  }

  if (values.length === 0) {
    return "values must not be empty.";
  }

  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return "every item in values must be a finite number.";
  }

  return null;
};

export const createPrediction = async (req, res, next) => {
  try {
    const validationError = validateValues(req.body.values);

    if (validationError) {
      return res.status(400).json({
        error: {
          message: validationError,
        },
      });
    }

    const prediction = await predict(req.body.values);

    return res.json(prediction);
  } catch (error) {
    return next(error);
  }
};
