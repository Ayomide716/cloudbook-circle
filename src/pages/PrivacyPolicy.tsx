import { Shield } from "@/components/icons";
import LegalPage, { LegalList } from "@/components/LegalPage";

const PrivacyPolicy = () => (
  <LegalPage
    icon={Shield}
    title="Privacy Policy"
    updated="April 4, 2026"
    summary={[
      "We collect what you give us (your profile, posts, messages) and basic details about how you use Ember.",
      "We use it to run Ember, show you a feed you care about and keep people safe.",
      "We don't sell your personal information.",
      "You can change your settings, download your data or delete your account at any time.",
    ]}
    sections={[
      {
        id: "collect",
        title: "Information we collect",
        body: (
          <>
            <h3>Information you provide</h3>
            <LegalList items={["Account info: name, email, password", "Profile details: bio, location, work, education, photos", "Content: posts, comments, messages, reactions", "Ad campaign data and credit transactions"]} />
            <h3>Collected automatically</h3>
            <LegalList items={["Device type, browser, operating system", "IP address and general location", "Usage patterns, pages visited, features used", "Online/offline status and last active time"]} />
          </>
        ),
      },
      {
        id: "use",
        title: "How we use it",
        body: <LegalList items={["Provide and improve Ember", "Personalize your feed and recommendations", "Deliver targeted advertisements", "Send notifications and updates", "Ensure safety and prevent abuse", "Analyze usage for product improvements"]} />,
      },
      {
        id: "sharing",
        title: "Who we share it with",
        body: (
          <>
            <p>We do not sell your personal information. We may share data with:</p>
            <LegalList items={["Service providers who help run Ember: Supabase (accounts and data), Cloudflare (photos and videos) and Vercel (the website)", "Law enforcement when required by law", "Other users (only content you choose to share)"]} />
          </>
        ),
      },
      { id: "security", title: "Keeping it safe", body: <p>We use industry-standard security, including encryption, secure sign-in and row-level security, so people only see what they're allowed to.</p> },
      {
        id: "rights",
        title: "Your rights",
        body: <LegalList items={["Access your personal data", "Correct inaccurate information", "Delete your account and associated data", "Control notification and privacy preferences", "Download a copy of your data"]} />,
      },
      { id: "cookies", title: "Cookies and tracking", body: <p>We use local storage and session tokens to keep you signed in. We do not use third-party tracking cookies.</p> },
      { id: "children", title: "Children", body: <p>Ember is not for children under 13. We do not knowingly collect data from children under 13.</p> },
      { id: "changes", title: "Changes to this policy", body: <p>We may update this policy from time to time. We'll tell you about significant changes in Ember.</p> },
    ]}
    contact={{ email: "privacy@cloudbook.app", label: "Questions about your privacy?" }}
    other={{ to: "/terms", label: "Terms of Service" }}
  />
);

export default PrivacyPolicy;
