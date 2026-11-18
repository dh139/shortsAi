import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import LandingPage from "./components/LandingPage"
import Dashboard from "./components/Dashboard"
import "./App.css"

function App() {
  return (
    <Router>
      <div className="App bg-[#060606] text-[#EDEDE8] min-h-screen">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/studio" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
