"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import HeroProfileActions from "../components/HeroProfileActions";
import { getCurrentProfile, Profile } from "../../lib/user";

const parentFaqs = [
  {
    question: "Who provides the prizes my child earns?",
    answer: "Families provide and approve prizes. Reading Quest tracks points and prize requests, but parents decide which rewards are available, when a child can claim them, and when a reward has been completed.",
  },
  {
    question: "Can my child take quizzes on books that are inappropriate for their age?",
    answer: "A child can search for many books, but Reading Quest detects the book level and limits which quiz difficulties are available. Parents should still review quiz history and use family expectations for what books are appropriate.",
  },
  {
    question: "How many child accounts can I link to one parent account?",
    answer: "The beta supports linked child accounts by plan. Free supports up to 2 children, Ad-Free supports up to 3 with optional added children, and Plus supports up to 5 with optional added children.",
  },
  {
    question: "Are quizzes meant to replace reading with a parent or teacher?",
    answer: "No. Quizzes are a reading habit and comprehension tool. Read-aloud books, audiobooks, library books, rereading, and assisted reading all count, because the goal is more reading and better understanding.",
  },
  {
    question: "What happens if a quiz question is wrong or impossible to answer?",
    answer: "Readers can report a question after a quiz. Parents can review reported questions, and approved corrections can give the reader credit for the missed question.",
  },
  {
    question: "Can my child earn points by taking easy quizzes on easy books over and over?",
    answer: "Reading Quest limits daily quizzes during beta and uses retake rules to reduce point farming. The app is designed to reward reading effort, comprehension, and trying appropriate challenges.",
  },
  {
    question: "What information does my child need to create an account?",
    answer: "Child accounts use a unique screen name and password. They should not enter unnecessary personal information, and parent-linked features require parent involvement.",
  },
  {
    question: "Can parents use Reading Quest too?",
    answer: "Yes. Parent accounts can take quizzes, set reading goals, appear on adult leaderboards, manage prizes, review child progress, and link verified child accounts.",
  },
];

export default function FaqPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const current = getCurrentProfile();
    if (!current) {
      router.push("/");
      return;
    }
    setProfile(current);
  }, [router]);

  if (!profile) {
    return <main><p>Loading...</p></main>;
  }

  const homeHref = profile.isParent ? "/parent" : "/home";

  return (
    <main className="app-screen">
      <div className="hero-panel app-hero">
        <div>
          <div className="kicker">Parent Guide</div>
          <h1>FAQ</h1>
          <p>Clear answers about prizes, quizzes, safety, accounts, and reading progress.</p>
        </div>
        <HeroProfileActions profile={profile} homeHref={homeHref} />
      </div>

      <section className="home-section faq-section" aria-labelledby="faq-heading">
        <h2 id="faq-heading">Common Parent Questions</h2>
        <div className="faq-list">
          {parentFaqs.map((item) => (
            <details key={item.question} className="faq-item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
