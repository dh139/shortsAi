const jwt = require("jsonwebtoken")

const auth = (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      return res.status(401).json({ message: "No token, authorization denied" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "23d3ffc4594fee31f55f9b202a5bd6f7c5bf7d4baff1e6db98a1badb09a361c0bb1bdca831c496de94f9f1470ec6ebb6bae2b7e6a1f42de4f9a98dc6cd922880")
    req.userId = decoded.userId
    next()
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" })
  }
}

module.exports = auth
