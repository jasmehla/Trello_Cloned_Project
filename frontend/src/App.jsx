import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import BoardPage from "./pages/BoardPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/board/:boardId" element={<BoardPage />} />
    </Routes>
  );
}
