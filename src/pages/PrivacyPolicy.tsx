import Navigation from "@/components/Navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PrivacyPolicy = () => {
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId} />
      <div className="max-w-3xl mx-auto px-4 py-10 prose dark:prose-invert">
        <h1>Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: April 4, 2026</p>

        <h2>1. Information We Collect</h2>
        <h3>Information You Provide</h3>
        <ul>
          <li>Account info: name, email, password</li>
          <li>Profile details: bio, location, work, education, photos</li>
          <li>Content: posts, comments, messages, reactions</li>
          <li>Ad campaign data and credit transactions</li>
        </ul>
        <h3>Automatically Collected</h3>
        <ul>
          <li>Device type, browser, operating system</li>
          <li>IP address and general location</li>
          <li>Usage patterns, pages visited, features used</li>
          <li>Online/offline status and last active time</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>Provide and improve the Platform</li>
          <li>Personalize your feed and recommendations</li>
          <li>Deliver targeted advertisements</li>
          <li>Send notifications and updates</li>
          <li>Ensure safety and prevent abuse</li>
          <li>Analyze usage for product improvements</li>
        </ul>

        <h2>3. Information Sharing</h2>
        <p>We do not sell your personal information. We may share data with:</p>
        <ul>
          <li>Service providers who help operate the Platform</li>
          <li>Law enforcement when required by law</li>
          <li>Other users (only content you choose to make public)</li>
        </ul>

        <h2>4. Data Security</h2>
        <p>We implement industry-standard security measures including encryption, secure authentication, and row-level security to protect your data.</p>

        <h2>5. Your Rights</h2>
        <ul>
          <li>Access your personal data</li>
          <li>Correct inaccurate information</li>
          <li>Delete your account and associated data</li>
          <li>Control notification and privacy preferences</li>
          <li>Download a copy of your data</li>
        </ul>

        <h2>6. Cookies & Tracking</h2>
        <p>We use local storage and session tokens for authentication. We do not use third-party tracking cookies.</p>

        <h2>7. Children's Privacy</h2>
        <p>Ember is not intended for children under 13. We do not knowingly collect data from children under 13.</p>

        <h2>8. Changes to This Policy</h2>
        <p>We may update this policy periodically. We will notify you of significant changes through the Platform.</p>

        <h2>9. Contact Us</h2>
        <p>For privacy-related inquiries, contact us at privacy@cloudbook.app.</p>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
