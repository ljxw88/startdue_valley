import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <section className="card">
        <h1>StartdueValley</h1>
        <p>
          Planning target: build a Stardew-inspired Next.js village sim where NPCs are AI agents with daily tasks, movement, and actions.
        </p>
        <p>
          Playable prototype: open <Link href="/game">/game</Link>.
        </p>
        <p>
          Controls: Arrow keys pan camera, and HUD buttons let you pause/play, change speed, and reset the day.
        </p>
      </section>
    </main>
  );
}