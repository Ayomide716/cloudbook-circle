import { FileText } from "@/components/icons";
import { Link } from "react-router-dom";
import LegalPage, { LegalList } from "@/components/LegalPage";

const TermsOfService = () => (
  <LegalPage
    icon={FileText}
    title="Terms of Service"
    updated="April 4, 2026"
    summary={[
      "You must be 13 or older and give accurate details.",
      "What you post stays yours; you let Ember show it on the app.",
      "Be kind: no harassment, spam, fake accounts or anything illegal.",
      "We can remove content or accounts that break these rules, and you can leave any time.",
    ]}
    sections={[
      { id: "acceptance", title: "Accepting these terms", body: <p>By using Ember ("the Platform"), you agree to these Terms of Service. If you don't agree, please don't use Ember.</p> },
      { id: "account", title: "Your account", body: <p>Give accurate information when you sign up and keep your password safe. You must be at least 13 years old to use Ember.</p> },
      {
        id: "content",
        title: "Your content",
        body: (
          <>
            <p>You own what you post. By posting, you give Ember a non-exclusive, worldwide, royalty-free licence to use, show and distribute it on the Platform.</p>
            <p>You're responsible for what you post, and it must not be illegal, harmful or infringe anyone's rights.</p>
          </>
        ),
      },
      {
        id: "acceptable-use",
        title: "What's not allowed",
        body: <LegalList items={["Harassing, bullying or threatening other people", "Spam, misleading content or malware", "Pretending to be someone else or making fake accounts", "Trying to get into systems or accounts you shouldn't", "Using Ember for anything illegal", "Scraping or collecting people's data without consent"]} />,
      },
      { id: "ads", title: "Advertising and credits", body: <p>Ember offers advertising paid for with credits. Credits can't be refunded or transferred. We can reject or remove any ad that breaks our policies.</p> },
      { id: "privacy", title: "Privacy", body: <p>Your use of Ember is also covered by our <Link to="/privacy">Privacy Policy</Link>, which explains what we collect and why.</p> },
      { id: "termination", title: "Ending your account", body: <p>We may suspend or close accounts that break these terms. You can delete your account at any time in Settings.</p> },
      { id: "disclaimers", title: "Disclaimers", body: <p>Ember is provided "as is", without warranties of any kind. We don't promise it will always work without interruptions or errors.</p> },
      { id: "liability", title: "Limitation of liability", body: <p>Ember isn't liable for indirect, incidental or consequential damages that come from using the Platform.</p> },
      { id: "changes", title: "Changes to these terms", body: <p>We may update these terms. If you keep using Ember after a change, you accept the new terms.</p> },
    ]}
    contact={{ email: "support@cloudbook.app", label: "Questions about these terms?" }}
    other={{ to: "/privacy", label: "Privacy Policy" }}
  />
);

export default TermsOfService;
