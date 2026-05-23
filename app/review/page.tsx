"use client";

import { useEffect, useState } from "react";
import HeroProfileActions from "../components/HeroProfileActions";
import {
  getCurrentProfile,
  getReviews,
  Profile,
  Review,
} from "../../lib/user";

export default function ReviewPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const current = getCurrentProfile();
    setProfile(current);

    if (!current) {
      setReviews([]);
      return;
    }

    const allReviews = getReviews().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (current.isParent) {
      const linked = current.linkedChildren || [];
      setReviews(allReviews.filter((review) => linked.includes(review.profileId)));
    } else {
      setReviews(allReviews.filter((review) => review.profileId === current.id));
    }
  }, []);

  return (
    <main>
      <div className="hero-panel">
        <div>
          <div className="kicker">Reading Notes</div>
          <h1>Book Reviews</h1>
          <p>
            {profile?.isParent
              ? "See the latest reviews left by your linked children."
              : "See the reviews you have left on books."
            }
          </p>
        </div>
        <HeroProfileActions profile={profile} homeHref={profile?.isParent ? "/parent" : "/home"} />
      </div>

      {reviews.length === 0 ? (
        <div className="output">
          <p>
            {profile?.isParent
              ? "No reviews found for your linked children yet."
              : "No reviews yet. Take a quiz and leave the first review!"
            }
          </p>
        </div>
      ) : (
        <div className="review-list">
          {reviews.map((review) => (
            <div key={review.id} className="review-card">
              <div className="review-header">
                <div>
                  <h3>{review.bookTitle}</h3>
                  <p className="review-meta">
                    {review.profileName} - {new Date(review.date).toLocaleDateString()}
                  </p>
                </div>
                <div className="review-rating">{review.rating} / 5</div>
              </div>
              {review.reviewText ? <p>{review.reviewText}</p> : <p className="review-note">No text review provided.</p>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
