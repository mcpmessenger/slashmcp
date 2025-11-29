import { PageHeader } from "@/components/PageHeader";
import { Footer } from "@/components/Footer";

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PageHeader title="Privacy Policy" />
      
      <div className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h1>Privacy Policy</h1>
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
          
          <section className="mt-8">
            <h2>Introduction</h2>
            <p>
              MCP Messenger ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service.
            </p>
          </section>

          <section className="mt-8">
            <h2>Information We Collect</h2>
            <h3>Information You Provide</h3>
            <ul>
              <li>Account information (email, name) when you sign in with Google</li>
              <li>Messages and content you send through the chat interface</li>
              <li>Files and documents you upload for analysis</li>
              <li>MCP server configurations and registry entries</li>
            </ul>

            <h3>Automatically Collected Information</h3>
            <ul>
              <li>Usage data and interaction logs</li>
              <li>Device information and browser type</li>
              <li>IP address and location data</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2>How We Use Your Information</h2>
            <ul>
              <li>To provide and maintain our service</li>
              <li>To process your requests and deliver AI-powered responses</li>
              <li>To analyze documents and images you upload</li>
              <li>To manage your MCP server configurations</li>
              <li>To improve our service and develop new features</li>
              <li>To communicate with you about your account</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2>Data Storage and Security</h2>
            <p>
              We use Supabase for authentication and data storage. Your data is stored securely and we implement appropriate technical and organizational measures to protect your personal information.
            </p>
            <p>
              Files uploaded for analysis are processed through AWS S3 and may be stored temporarily for processing purposes.
            </p>
          </section>

          <section className="mt-8">
            <h2>Third-Party Services</h2>
            <p>We use the following third-party services:</p>
            <ul>
              <li><strong>Supabase</strong>: Authentication and database services</li>
              <li><strong>AWS S3 & Textract</strong>: File storage and document processing</li>
              <li><strong>OpenAI, Anthropic, Google Gemini</strong>: AI model providers for chat and analysis</li>
              <li><strong>Google OAuth</strong>: Authentication provider</li>
            </ul>
            <p>
              These services have their own privacy policies governing the use of your information.
            </p>
          </section>

          <section className="mt-8">
            <h2>Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data</li>
              <li>Opt out of certain data processing activities</li>
            </ul>
            <p>
              To exercise these rights, please contact us through our GitHub repository or email.
            </p>
          </section>

          <section className="mt-8">
            <h2>Cookies and Tracking</h2>
            <p>
              We use cookies and similar tracking technologies to maintain your session and improve your experience. You can control cookie preferences through your browser settings.
            </p>
          </section>

          <section className="mt-8">
            <h2>Children's Privacy</h2>
            <p>
              Our service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.
            </p>
          </section>

          <section className="mt-8">
            <h2>Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section className="mt-8">
            <h2>Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us:
            </p>
            <ul>
              <li>GitHub: <a href="https://github.com/mcpmessenger/slashmcp" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">github.com/mcpmessenger/slashmcp</a></li>
              <li>YouTube: <a href="https://www.youtube.com/@MCPMessenger" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">youtube.com/@MCPMessenger</a></li>
            </ul>
          </section>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}

