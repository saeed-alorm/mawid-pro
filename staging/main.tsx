import { createRoot } from "react-dom/client";
import { StagingSignIn } from "../src/components/staging-sign-in";
import { LanguageProvider } from "../src/lib/i18n";
import "../src/styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <LanguageProvider>
      <StagingSignIn />
    </LanguageProvider>,
  );
}
