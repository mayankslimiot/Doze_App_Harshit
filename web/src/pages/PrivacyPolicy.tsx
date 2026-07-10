import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  ArrowLeft,
  Printer,
  ChevronRight,
  User,
  Users,
  Database,
  Mail,
  AlertCircle,
  Building,
  Info,
  Cookie,
  Baby,
  Clock,
  Briefcase
} from 'lucide-react';
import logoImage from '@/assets/dozemate512.jpg';

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', label: '1. Overview', icon: Shield },
    { id: 'account', label: '2. Account Creation', icon: User },
    { id: 'social', label: '3. Social Credentials', icon: Users },
    { id: 'sync', label: '4. Device Syncing', icon: Database },
    { id: 'comms', label: '5. Communications', icon: Mail },
    { id: 'usage', label: '6. Device & App Usage', icon: Info },
    { id: 'purchase', label: '7. Purchase Information', icon: Briefcase },
    { id: 'recipients', label: '8. Data Recipients', icon: Users },
    { id: 'transfers', label: '9. Data Transfers', icon: Building },
    { id: 'cookies', label: '10. Cookies & Analytics', icon: Cookie },
    { id: 'children', label: '11. Children\'s Privacy', icon: Baby },
    { id: 'retention', label: '12. Data Retention', icon: Clock },
    { id: 'controller', label: '13. Data Protection / DPO', icon: Building },
    { id: 'rights', label: '14. Your Rights', icon: Shield },
  ];

  const handleScrollTo = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      const headerOffset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 150;
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-800 font-sans flex flex-col antialiased">
      {/* Header - Hidden in Print */}
      <header className="sticky top-0 z-40 w-full bg-white border-b border-gray-200/80 backdrop-blur-md bg-white/95 px-6 py-4 flex items-center justify-between shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex items-center text-gray-600 hover:text-gray-900 group"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <div className="h-6 w-px bg-gray-200"></div>
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-gray-100 bg-white">
                <img src={logoImage} alt="dozemate" className="w-full h-full object-cover" />
              </div>
              <span className="text-md font-bold tracking-tight text-gray-900">
                slimiot<span className="text-primary font-bold">™</span> Privacy
              </span>
            </div>
          </div>
          
          <button
            onClick={handlePrint}
            className="flex items-center px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm font-semibold transition-colors duration-200"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print / PDF
          </button>
        </div>
      </header>

      {/* Hero Banner - Print simplified */}
      <section className="bg-gradient-to-r from-teal-900 to-[#014f5e] text-white py-12 px-6 shadow-md print:bg-none print:text-black print:border-b print:border-gray-200 print:py-6 print:shadow-none">
        <div className="max-w-7xl mx-auto flex flex-col justify-center">
          <span className="text-teal-300 font-mono text-xs uppercase tracking-widest mb-2 print:text-gray-500">Legal Documents</span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-teal-100 max-w-2xl text-sm md:text-base print:text-gray-700">
            Effective Date: June 18, 2026. This policy applies to users of the slimiot™ products and applications.
          </p>
        </div>
      </section>

      {/* Main Layout */}
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 py-10 flex-1 flex flex-col lg:flex-row gap-8 print:p-0">
        
        {/* Navigation Sidebar (Left) - Hidden on Mobile and in Print */}
        <aside className="w-64 shrink-0 hidden lg:block print:hidden">
          <div className="sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto pr-2 bg-white/50 rounded-xl p-4 border border-gray-200/50">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-3 mb-4">Sections</h3>
            <nav className="space-y-1">
              {sections.map((sec) => {
                const Icon = sec.icon;
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => handleScrollTo(sec.id)}
                    className={`w-full flex items-center px-3 py-2 text-xs font-semibold rounded-lg text-left transition-all duration-200 group ${
                      isActive
                        ? 'bg-primary/10 text-primary border-l-2 border-primary pl-3.5'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mr-2.5 shrink-0 ${isActive ? 'text-primary' : 'text-gray-400 group-hover:text-gray-600'}`} />
                    {sec.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content Panel (Right) */}
        <main className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6 md:p-8 space-y-12 print:border-none print:shadow-none print:p-0">
          
          {/* Section 1: Overview */}
          <section id="overview" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">1. Scope and Overview</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                This Privacy Policy applies to users of the slimiot™ products and applications. slimiot Private Limited, an Indian company, is the developer and the owner of all the commercial rights to the applications and products sold under the slimiot™ Brand. This includes <strong>Slimring, dozemate, Hexaskin, slimiot walk, slimiot PPG, slimiot ECG, slimiot HRV</strong> and others.
              </p>
              <p>
                slimiot Private Limited ("We", "Our", "slimiot" or "The Company") have updated our privacy policy to include additional information required under applicable Data protection regulations as the following:
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {[
                  'Why we process personal data',
                  'Legal grounds for processing personal data',
                  'Contact information for slimiot data controllers',
                  'Contact information for the slimiot data protection officer in India'
                ].map((item, index) => (
                  <li key={index} className="flex items-start bg-gray-50 p-2.5 rounded-lg border border-gray-100 text-xs font-semibold text-gray-700">
                    <ChevronRight className="w-4 h-4 text-primary shrink-0 mr-2" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Section 2: Account Creation */}
          <section id="account" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <User className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">2. Personal Data Processed Upon Account Creation</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                When you create a slimiot account, we ask you to provide your email address and name. You can choose to provide only your first name or a nickname instead of your full name if you wish.
              </p>
              
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-4 mt-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Purposes and Legal Grounds:</h3>
                
                <div className="space-y-4 text-xs">
                  <div className="p-3 bg-white rounded-lg border border-gray-100 shadow-2xs">
                    <span className="font-bold text-primary mr-1">(a) Security & Sign-in:</span>
                    slimiot processes your email address because you use your email address and your password to sign in to your account.
                    <div className="mt-2 text-[11px] font-semibold text-teal-800 bg-teal-50 inline-block px-2.5 py-0.5 rounded-full">
                      Legal Ground: Legitimate interest in protecting the security of your account.
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-gray-100 shadow-2xs">
                    <span className="font-bold text-primary mr-1">(b) Core Communications & Interactions:</span>
                    slimiot processes your email address for the purpose of sending you important information about your products, apps or account (such as safety notifications or policy updates). The name you provide is displayed when you interact, submit comments, or post material on a website or app.
                    <div className="mt-2 text-[11px] font-semibold text-teal-800 bg-teal-50 inline-block px-2.5 py-0.5 rounded-full">
                      Legal Ground: Legitimate interest in providing safety/policy updates and community interaction opportunities.
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-gray-100 shadow-2xs">
                    <span className="font-bold text-primary mr-1">(c) Marketing Communications:</span>
                    If you opt-in to marketing communications, slimiot will process your email address for sending you promotions, marketing info about products and apps.
                    <div className="mt-2 text-[11px] font-semibold text-teal-800 bg-teal-50 inline-block px-2.5 py-0.5 rounded-full">
                      Legal Ground: Consent. You can withdraw consent at any time via preferences or unsubscribe links.
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-gray-100 shadow-2xs">
                    <span className="font-bold text-primary mr-1">(d) Customer Support Association:</span>
                    slimiot processes your email address to link your support queries with your registered account.
                    <div className="mt-2 text-[11px] font-semibold text-teal-800 bg-teal-50 inline-block px-2.5 py-0.5 rounded-full">
                      Legal Ground: Legitimate interest in providing quality customer support.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Social Credentials */}
          <section id="social" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">3. Social Media Credentials</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                You may choose to sign in to your slimiot account using your social media sign in credentials (e.g., your Facebook credentials).
              </p>
              <div className="p-4 bg-teal-50/50 rounded-xl border border-teal-100 text-xs flex items-start text-teal-900">
                <AlertCircle className="w-5 h-5 text-primary shrink-0 mr-3 mt-0.5" />
                <div>
                  <strong>Important Notice:</strong> While the social sign-on configuration makes elements like your name, profile photo, comments, etc., accessible initially, <strong>slimiot ONLY retains and processes your email address</strong>. If you do not wish to share this data, you should log in using standard credentials instead.
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Device Syncing */}
          <section id="sync" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Database className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">4. Device Syncing Data</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                When you sync your device, we log analytical data about the transmission. This includes:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 text-xs text-gray-700">
                {['IP Address', 'Sync Date & Time', 'Crash/Diagnostic Logs', 'Geographic Location', 'Device Information', 'Network Type (Wi-Fi/Cellular)', 'Battery Level'].map((item, idx) => (
                  <span key={idx} className="bg-gray-50 border border-gray-100 px-3 py-2 rounded-lg font-medium text-center shadow-3xs">{item}</span>
                ))}
              </div>
              <div className="mt-3 p-3 bg-teal-50 rounded-lg border border-teal-100 text-xs font-semibold text-teal-800 inline-block">
                Legal Ground & Purpose: Legitimate interest in resolving sync errors and maintaining product support.
              </div>
            </div>
          </section>

          {/* Section 5: Communications */}
          <section id="comms" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Mail className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">5. Communications and Customer Support</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                When you communicate with customer support (via email, phone, web, or in-person), we collect:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-4 text-xs font-medium text-gray-700">
                <li>Your name, mailing address, telephone number, email address, and contact preferences.</li>
                <li>Information about your slimiot products (such as device IDs and purchase dates).</li>
                <li>Support tickets, event/diagnostic logs, and summary notes of the issue.</li>
              </ul>
              <div className="p-3 bg-teal-50 rounded-lg border border-teal-100 text-xs font-semibold text-teal-800 inline-block">
                Legal Ground & Purpose: Legitimate interest in delivering quality customer and product support.
              </div>
            </div>
          </section>

          {/* Section 6: Device & App Usage */}
          <section id="usage" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Info className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">6. Device or App Usage</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                If you use a slimiot device or application and provide your consent, slimiot will collect and upload location, speed, direction, and recording timestamp details.
              </p>
              <p className="bg-orange-50/50 p-4 border border-orange-100 text-orange-950 rounded-xl text-xs">
                <strong>Third-Party Sharing:</strong> With your explicit consent, slimiot may share this aggregated data with or sell it to third-party providers to enhance traffic navigation, parking services, and map functionalities.
              </p>
            </div>
          </section>

          {/* Section 7: Purchase Info */}
          <section id="purchase" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Briefcase className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">7. Web Purchases</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                If you purchase a product directly on our website, we collect your name, mailing address, and telephone number to fulfill the order.
              </p>
              <div className="p-4 bg-teal-50/50 rounded-xl border border-teal-100 flex items-start text-xs text-teal-900">
                <AlertCircle className="w-5 h-5 text-primary shrink-0 mr-3 mt-0.5" />
                <div>
                  <strong>Payment Security:</strong> We do NOT view, store, or process your payment card information. All transactions are handled securely by professional third-party card processors.
                </div>
              </div>
              <div className="p-3 bg-teal-50 rounded-lg border border-teal-100 text-xs font-semibold text-teal-800 inline-block">
                Legal Ground: Performance of a contract.
              </div>
            </div>
          </section>

          {/* Section 8: Data Recipients */}
          <section id="recipients" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">8. Categories of Personal Data Recipients</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <div className="space-y-4">
                <div className="border border-gray-100 rounded-xl p-4 hover:shadow-2xs transition-shadow">
                  <h4 className="font-bold text-sm text-gray-900 mb-1">Your Friends & Invitees</h4>
                  <p className="text-xs">
                    "Friends" is a feature available on some slimiot devices that enables you to send a real-time location link to people of your choice. Because anyone with access to the link will be able to see the real-time location of your device, you should use caution in determining to whom you want to send the link.
                  </p>
                </div>
                <div className="border border-gray-100 rounded-xl p-4 hover:shadow-2xs transition-shadow">
                  <h4 className="font-bold text-sm text-gray-900 mb-1">Service Providers</h4>
                  <p className="text-xs">
                    We use third-party cloud hosting and analytics services to assist in sending emails, shipping products, and understanding customers' needs. These services track interactions with email links and help optimize user experience.
                  </p>
                </div>
                <div className="border border-gray-100 rounded-xl p-4 hover:shadow-2xs transition-shadow">
                  <h4 className="font-bold text-sm text-gray-900 mb-1">Disclosures Required by Law</h4>
                  <p className="text-xs">
                    We may disclose personal data about you to others if we have your consent, to comply with valid subpoenas, court orders, legal processes, to enforce terms and policies, or as necessary to defend legal claims.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 9: Transfers */}
          <section id="transfers" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Building className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">9. International Transfers</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                slimiot is a global business. Personal data may be stored on slimiot servers located in India, United States, or in Europe, as configured per your device region. Personal data regarding individuals residing in the Asia-Pacific region, European Economic Area (EEA), or USA is controlled by slimiot's affiliates and processed on their behalf by slimiot Private Limited.
              </p>
              <p className="border-l-4 border-primary pl-4 text-xs italic">
                Any transfers of personal data from slimiot companies are done pursuant to Integrity and approved Model Contractual Clauses. All slimiot companies are required to follow the privacy practices set forth in this Privacy Statement.
              </p>
            </div>
          </section>

          {/* Section 10: Cookies */}
          <section id="cookies" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Cookie className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">10. Cookies & Tracking Technologies</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wide mb-2">Websites</h4>
                  <p className="text-xs">
                    We collect browser language, IP address, page views, geographic location, and interaction events to compile statistics and analyze navigation.
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wide mb-2">Mobile Apps</h4>
                  <p className="text-xs">
                    We track app version, location settings, download items, frequency of feature usage, device model, and OS version to optimize features.
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wide mb-2">Google Analytics & Console</h4>
                  <p className="text-xs">
                    Used to track visitor demographics, behavior, interests, and to improve search engine optimization.
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wide mb-2">Performance Monitoring</h4>
                  <p className="text-xs">
                    APM systems capture request details and IP addresses to quickly diagnose anomalies and service errors.
                  </p>
                </div>
              </div>
              <p className="text-xs">
                <strong>Social Networks:</strong> Third-party plugins and interactive features use cookies based on the privacy statements of their respective platforms.
              </p>
            </div>
          </section>

          {/* Section 11: Children */}
          <section id="children" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Baby className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">11. Children's Privacy</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                The slimiot device and applications are not intended to be purchased or used by anyone under the age of 13. We do not knowingly collect personal information from children under 13.
              </p>
              <p className="text-xs font-semibold text-gray-700 bg-red-50/50 p-3 rounded-lg border border-red-100 inline-block">
                If you believe we might possess any details from a child under 13, please email us immediately at <a href="mailto:support@slimiot.com" className="text-primary hover:underline">support@slimiot.com</a>.
              </p>
            </div>
          </section>

          {/* Section 12: Data Retention */}
          <section id="retention" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Clock className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">12. Data Retention</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                We retain your personal data as long as your slimiot account is active. Please refer to Section 14 below for instructions on how to exercise your right of erasure.
              </p>
            </div>
          </section>

          {/* Section 13: Controller & DPO Contact */}
          <section id="controller" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Building className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">13. Data Controller & Protection Officer</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 space-y-3">
                <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block">
                  Data Controller
                </span>
                <p className="font-bold text-gray-900">slimiot Private Limited India</p>
                <div className="text-xs text-gray-600 space-y-1.5 leading-relaxed">
                  <p><strong>Address:</strong> Office of 429, Sector 11D, Faridabad, Haryana, India.</p>
                  <p><strong>Scope:</strong> Residents of Indian sub-continent, EEA, and USA.</p>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 space-y-3">
                <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block">
                  Data Protection Officer
                </span>
                <p className="font-bold text-gray-900">slimiot DPO Office</p>
                <div className="text-xs text-gray-600 space-y-1.5 leading-relaxed">
                  <p><strong>Email contact:</strong> <a href="mailto:info@slimiot.com" className="text-primary font-semibold hover:underline">info@slimiot.com</a></p>
                  <p><strong>Scope:</strong> Regulatory compliance under GDPR and Indian Data Protection law.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 14: Your Rights */}
          <section id="rights" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">14. Your Rights Under GDPR / Regulations</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                Under data protection regulations, you have key rights regarding your personal data:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-700 font-semibold">
                {['Access / Rectification', 'Data Portability', 'Right of Erasure', 'Restriction of Processing', 'Objection to Processing', 'Lodge a Complaint'].map((r, i) => (
                  <span key={i} className="bg-gray-50 border border-gray-200/80 px-3 py-2.5 rounded-lg text-center shadow-3xs">{r}</span>
                ))}
              </div>

              <div className="mt-4 p-4 border border-gray-200 rounded-xl bg-gray-50/50 space-y-3 text-xs">
                <p className="font-bold text-gray-900">How to exercise your rights:</p>
                <ul className="list-disc list-inside space-y-2 leading-relaxed text-gray-600 pl-2">
                  <li>
                    <strong>Access, rectification, portability, erasure, or account deletion:</strong> Send an email to <a href="mailto:info@slimiot.com" className="text-primary font-semibold hover:underline">info@slimiot.com</a>. Make sure to include all details about your account, such as login email and the device ID(s) of your slimiot devices.
                  </li>
                  <li>
                    <strong>Restriction or objection to processing:</strong> Contact our Data Protection Officer at <a href="mailto:info@slimiot.com" className="text-primary font-semibold hover:underline">info@slimiot.com</a>.
                  </li>
                </ul>
              </div>
            </div>
          </section>

        </main>
      </div>
      
      {/* Footer - Hidden in Print */}
      <footer className="mt-auto py-6 px-6 bg-white border-t border-gray-200/80 text-center text-xs text-gray-500 font-medium print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© 2026 slimiot Private Limited. All commercial rights reserved.</p>
          <div className="flex space-x-4">
            <a href="#" className="hover:text-gray-900 transition-colors">Terms of Service</a>
            <a href="mailto:support@slimiot.com" className="hover:text-gray-900 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
