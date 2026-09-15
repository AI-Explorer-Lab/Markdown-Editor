import { createRoot } from "react-dom/client";
import App from "./App";
import "katex/dist/katex.min.css";
import "./article.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(<App />);
