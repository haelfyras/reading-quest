const encouragementMessages = {
  low: [
    "You started the quest. That's what matters!",
    "You showed up and gave this book a try. That counts.",
    "Every reader starts somewhere. This quest is officially begun.",
  ],
  growing: [
    "Nice effort. Try looking back through the book and retaking it for a higher score!",
    "Good work. A quick look back at the story could help you climb higher next time.",
    "You're building understanding. Revisit the book and try again when you're ready.",
  ],
  nearPerfect: [
    "Great job! You only missed one question!",
    "So close to perfect. Just one question got away!",
    "Excellent work. One more correct answer would have made it perfect.",
  ],
  mastered: [
    "Excellent! You've mastered this book!",
    "Outstanding. This book is mastered!",
    "Brilliant work. You clearly know this book.",
  ],
};

export function getEncouragementMessage(score: number, maxScore: number, bookTitle: string) {
  const missed = Math.max(0, maxScore - score);
  const accuracy = maxScore > 0 ? score / maxScore : 0;
  const category =
    score === maxScore
      ? "mastered"
      : missed === 1
        ? "nearPerfect"
        : accuracy < 0.5
          ? "low"
          : "growing";
  const options = encouragementMessages[category];
  const seed = `${bookTitle}-${score}-${maxScore}-${new Date().toDateString()}`;
  const index = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0), 0) % options.length;
  return options[index];
}
