import { useState, useEffect } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import axios from "axios"
import Navbar from "./components/Navbar"
import Login from "./components/Login"
import Register from "./components/Register"
import Dashboard from "./components/Dashboard"
import LandingPage from "./components/LandingPage"
import "./App.css"

// Simple axios interceptor (NO refresh token)
const setupAxiosInterceptor = () => {
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const requestUrl = error.config?.url || ""

      // ✅ Don't intercept the verify call itself — let checkAuthStatus handle it
      if (
        error.response?.status === 401 &&
        !requestUrl.includes("/auth/verify")
      ) {
        localStorage.removeItem("token")
        delete axios.defaults.headers.common["Authorization"]
        window.location.href = "/login"
      }
      return Promise.reject(error)
    }
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setupAxiosInterceptor()
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
  try {
    const token = localStorage.getItem("token")

    if (!token) {
      setLoading(false)  // ✅ Early return, no token
      return
    }

    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`

    const response = await axios.get("http://localhost:5000/api/auth/verify")
    setUser(response.data.user)

  } catch (error) {
    // ✅ Silently clear bad/expired token — let the Router handle redirect
    localStorage.removeItem("token")
    delete axios.defaults.headers.common["Authorization"]
    setUser(null)
  } finally {
    setLoading(false)
  }
}

  const handleLogin = (userData) => {
    setUser(userData.user)

    const token = userData.token
    localStorage.setItem("token", token)

    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem("token")
    delete axios.defaults.headers.common["Authorization"]
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <Router>
      <div className="App">
        <Navbar user={user} onLogout={handleLogout} />

        <Routes>
          <Route
            path="/"
            element={user ? <Navigate to="/dashboard" /> : <LandingPage />}
          />
          <Route
            path="/login"
            element={user ? <Navigate to="/dashboard" /> : <Login onLogin={handleLogin} />}
          />
          <Route
            path="/register"
            element={user ? <Navigate to="/dashboard" /> : <Register onLogin={handleLogin} />}
          />
          <Route
            path="/dashboard"
            element={user ? <Dashboard user={user} /> : <Navigate to="/login" />}
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App