export const getHealth = (req, res) => {
  res.json({
    status: "healthy",
    service: "backend",
  });
};
