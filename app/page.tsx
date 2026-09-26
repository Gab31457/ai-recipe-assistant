import ChatInterface from "@/components/ChatInterface";

import styles from "./page.module.css";

/*
 * Az alkalmazás kezdőoldala.
 *
 * Ez Server Component maradhat, mert maga az oldal
 * nem kezel böngészőoldali állapotot.
 *
 * Az interaktív működés a külön ChatInterface
 * Client Componentben található.
 */
export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.pageContainer}>
        <header className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.eyebrow}>
              AI Engineering házi feladat
            </div>

            <h1 className={styles.title}>
              AI Receptasszisztens
            </h1>

            <p className={styles.subtitle}>
              Kérdezz a feltöltött receptekről.
              Az alkalmazás OpenAI embeddinget,
              PostgreSQL pgvector keresést és
              RAG-alapú válaszgenerálást használ.
            </p>
          </div>

          <div
            className={styles.architectureCard}
          >
            <span>Next.js</span>
            <span>OpenAI</span>
            <span>PostgreSQL</span>
            <span>pgvector</span>
          </div>
        </header>

        <ChatInterface />

        <footer className={styles.footer}>
          <p>
            A válaszokat mindig ellenőrizd az
            eredeti receptforrások alapján.
          </p>
        </footer>
      </div>
    </main>
  );
}