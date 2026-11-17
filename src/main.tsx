import { createRoot } from "react-dom/client";
import AuthGate from "./AuthGate";
import "katex/dist/katex.min.css";
import "./article.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(<AuthGate />);
