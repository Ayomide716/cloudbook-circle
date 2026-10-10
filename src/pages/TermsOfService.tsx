import Navigation from "@/components/Navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const TermsOfService = () => {
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
        <h1>Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: April 4, 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using Ember ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.</p>

        <h2>2. Account Registration</h2>
        <p>You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials. You must be at least 13 years old to use Ember.</p>

        <h2>3. User Content</h2>
        <p>You retain ownership of content you post. By posting content, you grant Ember a non-exclusive, worldwide, royalty-free license to use, display, and distribute your content on the Platform. You are solely responsible for your content and must not post illegal, harmful, or infringing material.</p>

        <h2>4. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Harass, bully, or threaten other users</li>
          <li>Post spam, misleading content, or malware</li>
          <li>Impersonate others or create fake accounts</li>
          <li>Attempt to gain unauthorized access to systems</li>
          <li>Use the Platform for illegal activities</li>
          <li>Scrape or collect user data without consent</li>
        </ul>

        <h2>5. Advertising & Credits</h2>
        <p>Ember offers an advertising system using credits. Credits are non-refundable and non-transferable. We reserve the right to reject or remove any ad campaign that violates our policies.</p>

        <h2>6. Privacy</h2>
        <p>Your use of Ember is also governed by our <a href="/privacy">Privacy Policy</a>. By using the Platform, you consent to the collection and use of your information as described therein.</p>

        <h2>7. Termination</h2>
        <p>We may suspend or terminate your account at any time for violations of these terms. You may delete your account at any time through your account settings.</p>

        <h2>8. Disclaimers</h2>
        <p>Ember is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free service.</p>

        <h2>9. Limitation of Liability</h2>
        <p>Ember shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Platform.</p>

        <h2>10. Changes to Terms</h2>
        <p>We may update these terms at any time. Continued use of Ember after changes constitutes acceptance of the new terms.</p>

        <h2>11. Contact</h2>
        <p>For questions about these terms, contact us at support@cloudbook.app.</p>
      </div>
    </div>
  );
};

export default TermsOfService;
