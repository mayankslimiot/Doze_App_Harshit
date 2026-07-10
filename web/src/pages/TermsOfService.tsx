import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  ArrowLeft,
  Printer,
  ChevronRight,
  User,
  AlertOctagon,
  Mail,
  FileText,
  Lock,
  MessageSquare,
  Scale,
  DollarSign,
  AlertTriangle,
  Flame,
  Link2,
  Info
} from 'lucide-react';
import logoImage from '@/assets/dozemate512.jpg';

export default function TermsOfService() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('acceptance');

  const sections = [
    { id: 'acceptance', label: 'Acceptance of Terms', icon: Shield },
    { id: 'use-of-service', label: '1. Use of Service', icon: Info },
    { id: 'accounts', label: '2. Registration & Accounts', icon: User },
    { id: 'responsibilities', label: '3. Your Responsibilities', icon: AlertOctagon },
    { id: 'comms', label: '4. Communications & SMS', icon: Mail },
    { id: 'submissions', label: '5. Content Submissions', icon: MessageSquare },
    { id: 'termination', label: '6. Term & Termination', icon: Lock },
    { id: 'ownership', label: '7. Ownership & Trademarks', icon: FileText },
    { id: 'copyright', label: '8. Copyright Infringement', icon: Scale },
    { id: 'warranty', label: '9. Warranty Disclaimer', icon: AlertTriangle },
    { id: 'liability', label: '10. Limitation of Liability', icon: DollarSign },
    { id: 'disputes-third-party', label: '11. Third Party Disputes', icon: Shield },
    { id: 'force-majeure', label: '12. Force Majeure', icon: Flame },
    { id: 'indemnity', label: '13. Indemnification', icon: Shield },
    { id: 'additional-features', label: '14. Additional Features', icon: Link2 },
    { id: 'dispute-resolution', label: '15. Arbitration & Disputes', icon: Scale },
    { id: 'governing-law', label: '16. Governing Law', icon: Scale },
    { id: 'feedback', label: '17. Feedback', icon: MessageSquare },
    { id: 'miscellaneous', label: '18-23. Misc. Clauses', icon: FileText },
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
                slimiot<span className="text-primary font-bold">™</span> Terms
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
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-teal-100 max-w-2xl text-sm md:text-base print:text-gray-700">
            Please read this Terms of Use Agreement carefully before using our mobile applications, website, or devices.
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
          
          {/* Section: Acceptance */}
          <section id="acceptance" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Terms of Use Agreement</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-950 font-medium space-y-3">
                <p>
                  THIS TERMS OF USE AGREEMENT (THE "AGREEMENT") ESTABLISHES THE TERMS AND CONDITIONS THAT APPLY TO YOU WHEN YOU USE THE SERVICE (AS DEFINED BELOW).
                </p>
                <p>
                  BY USING THE SERVICE, YOU INDICATE YOUR ACCEPTANCE OF THIS AGREEMENT AND YOUR AGREEMENT TO BE BOUND BY THE TERMS AND CONDITIONS OF THIS AGREEMENT, AS WELL AS ALL APPLICABLE LAWS AND REGULATIONS. YOU ARE NOT PERMITTED TO USE THE SERVICE IF YOU DO NOT AGREE TO ALL OF THE TERMS AND CONDITIONS OF THIS AGREEMENT.
                </p>
                <p>
                  THIS AGREEMENT CAN BE CHANGED, MODIFIED, SUPPLEMENTED, AND/OR UPDATED BY SLIMIOT PRIVATE LIMITED ("THE COMPANY", "WE", "OUR", OR "US") AT ANY TIME; PROVIDED THAT WE WILL PUBLISH PRIOR NOTICE OF ANY MATERIAL CHANGES.
                </p>
                <p className="border-t border-orange-200 pt-2 text-[11px] text-orange-900">
                  YOUR CONTINUED USE OF THE SERVICE AFTER THE MODIFICATION OF THIS AGREEMENT MEANS THAT YOU ACCEPT ALL SUCH CHANGES. ACCORDINGLY, YOU ARE ADVISED TO CONSULT THIS AGREEMENT EACH TIME YOU ACCESS THE SERVICE.
                </p>
              </div>
            </div>
          </section>

          {/* Section 1: Use of Service */}
          <section id="use-of-service" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Info className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">1. Use of Web Site, Mobile Applications, and our Service</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                <strong>a. The "Service":</strong> Refers to slimiot's mobile applications and website located at <a href="https://slimiot.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">slimiot.com</a>, as each may be updated, relocated, or otherwise modified from time to time, including through networks, embeddable widgets, downloadable software, and tablet computer applications, and all intellectual property contained therein. The Service provides a GPS-GSM device allowing you to find and track the device with a network through which slimiot can provide locations (each, a "Location") to consumers. Any person who accesses and/or uses the slimiot Network to locate a device on his or her own behalf, or on behalf of any third party, is referred to as a <strong>"slimiot Member"</strong>.
              </p>
              <p>
                <strong>b. IoT Wearables and Devices:</strong> The "Service" also includes slimiot's IoT devices (proprietary or otherwise, wearable or otherwise) used to collect personal health and other data of users for the sole purpose of analysis and as deemed fit by the Company with no intention to harm any individual directly or indirectly.
              </p>
              <p>
                <strong>c. License Grant:</strong> Subject to the terms and conditions of this Agreement, the Company hereby grants you a limited, revocable, non-exclusive, non-transferable license to access and use the Service, solely in the manner intended by the Company. Unless otherwise specified in writing, the Service is solely for your personal use and not for resale. The Company reserves the right at all times and without notice to:
              </p>
              <ul className="list-disc list-inside pl-4 text-xs space-y-1.5">
                <li>Restrict and/or terminate your access to the Service (or any portion thereof); and</li>
                <li>Modify or discontinue providing the Service (or any portion thereof).</li>
              </ul>
              <p>
                <strong>d. Privacy Policy Reference:</strong> The Company's policy with respect to the collection and use of your personally identifiable information is set in our Privacy Policy. By accepting this Agreement, you acknowledge your agreement with slimiot's Privacy Policy.
              </p>
            </div>
          </section>

          {/* Section 2: Registration & Accounts */}
          <section id="accounts" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <User className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">2. Registration, Accounts, Passwords and Security</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                <strong>a. Registration:</strong> To become a slimiot Member, you must complete the registration process by providing the Company with current, complete, and accurate information, as prompted by the applicable registration form.
              </p>
              <p>
                <strong>b. Accuracy of Information:</strong> You acknowledge that in the event you provide any information to the Company which is untrue, inaccurate, not current, or incomplete, the Company may terminate this Agreement and block your access and use of the Service.
              </p>
              
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-gray-900 text-xs uppercase tracking-wide">c. Eligibility Rules</h4>
                <p className="text-xs">
                  You represent and warrant that you are at least eighteen (18) years of age, have not been previously suspended or removed from the Service, and possess the legal right and ability to enter into this Agreement.
                </p>
                <div className="p-3 bg-red-50 text-red-900 rounded-lg text-xs border border-red-100">
                  <strong>Age Restriction:</strong> THE SERVICE IS NOT FOR PERSONS UNDER THE AGE OF 13. IF YOU ARE UNDER 13 YEARS OF AGE, PLEASE DO NOT USE OR ACCESS THE SERVICE AT ANY TIME. Individuals between 13 and 18 years of age may use the services only under the supervision of a parent or legal guardian.
                </div>
              </div>

              <p>
                <strong>d. Credentials:</strong> You will select a username and password. You are entirely responsible for maintaining the security and confidentiality of your credentials. You agree to notify the Company immediately of any unauthorized account activity at <a href="mailto:info@slimiot.com" className="text-primary hover:underline font-semibold">info@slimiot.com</a>. The Company is not liable for losses caused by unauthorized use of your account, but you may be held liable for losses incurred by the Company due to such use.
              </p>
            </div>
          </section>

          {/* Section 3: Your Responsibilities */}
          <section id="responsibilities" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <AlertOctagon className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">3. Your Responsibilities & Prohibitions</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                You may use the Service solely for lawful, non-commercial purposes. You may not damage, disable, overburden, or impair our servers, networks, or interfere with any other party's use.
              </p>
              
              <div className="p-4 border border-gray-100 rounded-xl space-y-3">
                <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wider">Specifically Prohibited Conduct:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {[
                    'Reverse engineering, decompiling, or disassembling the software or devices',
                    'Removing copyright, trademark or proprietary notices from materials',
                    'Automated scraping (robots, spiders, or database scrapers) to index content',
                    'Probing, scanning, or vulnerability testing of any system or network',
                    'Framing, reformatting, or mirroring web pages of the Service',
                    'Transmitting viruses, Trojan horses, worms, or disruptive components',
                    'Defamatory, threatening, obscene, or unlawful transmissions',
                    'Using or accessing the Service to build a competing product or service'
                  ].map((rule, idx) => (
                    <div key={idx} className="flex items-start space-x-2 bg-gray-50/50 p-2.5 rounded-lg border border-gray-100">
                      <ChevronRight className="w-4 h-4 text-red-500 shrink-0 mr-1 mt-0.5" />
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Consent to Electronic Communications */}
          <section id="comms" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Mail className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">4. Consent to Electronic Communications</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                <strong>a. Electronic Notices:</strong> By using the Service, you agree that we may communicate with you electronically regarding security, privacy, and administrative issues. In the event of a security breach, we may post a notice on the Service or email you. You can request free written notice of security breaches or withdraw consent by emailing <a href="mailto:info@slimiot.com" className="text-primary hover:underline font-semibold">info@slimiot.com</a>.
              </p>
              <p>
                <strong>b. SMS Text Messages & Push Notifications:</strong> We may send SMS messages for mobile verification codes, system updates, and marketing offers. You consent to receive these informational SMS text messages. You can disable push notifications on your device or contact support to request removal from our databases.
              </p>
              <p>
                <strong>c. Delivery Disclaimer:</strong> The Company is not responsible for factors beyond its control (mobile carrier outages, signal loss, network delays, or delivery failure).
              </p>
            </div>
          </section>

          {/* Section 5: Content Submissions */}
          <section id="submissions" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">5. Content Submitted to the Company</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                <strong>a. License to Submissions:</strong> If you send or transmit ideas, suggestions, notes, or creative concepts ("Materials"), you grant the Company a worldwide, non-exclusive, sublicensable, assignable, royalty-free, perpetual, and irrevocable right to use, reproduce, modify, display, and distribute such materials in any media to enhance the Service, without compensation to you. We will never use your real name in marketing materials without your prior consent.
              </p>
              <p>
                <strong>b. Monitoring Rights:</strong> The Company reserves the right (but not the obligation) to monitor, alter, or remove user-submitted materials at any time, for any reason, to protect the security and integrity of the Service or comply with legal requests.
              </p>
              <p>
                <strong>c. Warranties:</strong> You represent and warrant that your submitted materials are owned by you, do not infringe any third-party copyrights or trademarks, do not contain malicious code, and contain no confidential information of third parties.
              </p>
            </div>
          </section>

          {/* Section 6: Term & Termination */}
          <section id="termination" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Lock className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">6. Term and Termination</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                <strong>a. Term:</strong> This Agreement begins when you first access the Service and continues as long as you access or utilize the Service. The Company reserves the right to suspend, terminate, or block your account/access for actual or suspected violations of this agreement. We may cooperate with law enforcement in civil or criminal investigations.
              </p>
              <p>
                <strong>b. Survival of Terms:</strong> Upon termination, sections regarding Proprietary Information, Account security, Prohibitions, Electronic Consent, Disclaimers, Liability Limits, Indemnification, and Dispute Resolutions will survive. Any outstanding payments accrued prior to termination remain fully payable.
              </p>
            </div>
          </section>

          {/* Section 7: Ownership */}
          <section id="ownership" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">7. Ownership and Trademarks</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                <strong>a. Proprietary Information:</strong> The Service (including source code, layouts, UI designs, and intellectual property) is owned exclusively by the Company and its licensors. It is licensed to you, not sold, pursuant to this Agreement.
              </p>
              <p>
                <strong>b. Trademarks:</strong> The Company is the sole owner of the trademark rights for the name and word mark <strong>"slimiot"™</strong> and other related branding marks. You agree not to challenge the validity of these trademarks. All other marks displayed are the properties of their respective owners.
              </p>
            </div>
          </section>

          {/* Section 8: Copyright Infringement */}
          <section id="copyright" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Scale className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">8. Claims of Copyright Infringement</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                The Copyright (Amendment) Act 2012 provides recourse for copyright owners who believe that material appearing on the Internet infringes their rights under Indian copyright law. If you believe in good faith that materials hosted by the Company infringe your copyright, you may send us a notice requesting removal or access block to:
              </p>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-2">
                <p className="font-bold text-gray-950">slimiot Private Limited</p>
                <p><strong>Address:</strong> 429, Sector 11D, Faridabad, Haryana, India.</p>
                <p className="text-gray-500 italic mt-2">
                  Notices must include signature, identification of the copyrighted work, URL/link of infringing material, your contact details, and statements of good faith/accuracy under penalty of perjury. See http://copyright.gov.in/ for details.
                </p>
              </div>
            </div>
          </section>

          {/* Section 9: Warranty Disclaimer */}
          <section id="warranty" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <AlertTriangle className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">9. Disclaimer of Warranty</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <div className="p-4 border border-red-200 bg-red-50/30 rounded-xl text-xs text-red-950 font-medium leading-relaxed uppercase space-y-2">
                <p>
                  THE SERVICE IS PROVIDED "AS IS" WITH ALL FAULTS, AND THE ENTIRE RISK AS TO SATISFACTORY QUALITY, PERFORMANCE, ACCURACY AND EFFORT IS WITH YOU.
                </p>
                <p>
                  WE DISCLAIM ALL WARRANTIES OR CONDITIONS, EXPRESS OR IMPLIED, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY OF INFORMATIONAL CONTENT, AND ABSENCE OF VIRUSES OR DAMAGING CODE.
                </p>
                <p>
                  NONE OF THE COMPANY, ITS AFFILIATES, SERVICE PROVIDERS, OR SUBSIDIARIES (COLLECTIVELY, THE "SLIMIOT PARTIES") WARRANT THE TIMELINESS, COMPLETENESS, OR ACCURACY OF THE SERVICE OR DATA.
                </p>
              </div>
            </div>
          </section>

          {/* Section 10: Limitation of Liability */}
          <section id="liability" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <DollarSign className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">10. Limitation of Liability</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <div className="p-4 border border-teal-200 bg-teal-50/30 rounded-xl text-xs text-teal-950 font-medium space-y-3 leading-relaxed">
                <p className="uppercase">
                  A. EACH USER IS SOLELY RESPONSIBLE FOR HIS OR HER USE OF THE SERVICE AND ANY RESULTING DAMAGES. THE AGGREGATE LIABILITY OF THE SLIMIOT PARTIES FOR ANY CLAIMS, CONTRACT OR TORT, WILL BE LIMITED TO ACTUAL PROVED DAMAGES NOT EXCEEDING THE AMOUNT PAID BY YOU TO THE COMPANY FOR THE SERVICE.
                </p>
                <p className="uppercase">
                  B. IN NO EVENT WILL THE SLIMIOT PARTIES BE LIABLE FOR PUNITIVE, SPECIAL, INDIRECT, OR CONSEQUENTIAL DAMAGES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
                </p>
                <p>
                  C. You represent that you have independently investigated the advisability of using the location/health tracking services and accept the possible risks. You agree to maintain your own insurance and look solely to such insurance for reimbursement of damages.
                </p>
              </div>
            </div>
          </section>

          {/* Section 11: Third Party Disputes */}
          <section id="disputes-third-party" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">11. Third Party Disputes</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                The Company is not affiliated with any mobile carrier or third-party service provider. Any dispute you have with a carrier, service provider, or third party (including employers or other users) is directly between you and them. You hereby release the Company (and its officers, directors, and employees) from any and all claims and damages resulting from such disputes.
              </p>
            </div>
          </section>

          {/* Section 12: Force Majeure */}
          <section id="force-majeure" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Flame className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">12. Force Majeure</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                The Company is not liable for delay or failure to perform any obligation due to unforeseen events beyond our reasonable control, such as strikes, blockades, war, terrorism, natural disasters, epidemics, or governmental action.
              </p>
            </div>
          </section>

          {/* Section 13: Indemnification */}
          <section id="indemnity" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">13. Indemnification and Release</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                <strong>a. Indemnity:</strong> You agree to defend, indemnify, and hold the Company, its licensors, parent organizations, and affiliates harmless against any loss or damage (including attorney fees) arising from: (i) your breach of this agreement; (ii) unauthorized use of the Service; and (iii) claims against the Company by parties to whom you allow access to the Service.
              </p>
              <p>
                <strong>b. Release:</strong> You waive, release, and discharge the Company Parties from any responsibility or liability for injuries or damages resulting from location tracking or services obtained through the Service, including those caused by negligence.
              </p>
              <p>
                <strong>c. Defense Control:</strong> We reserve the right to assume exclusive defense and control of any matter subject to indemnification by you, at our expense. You will not settle any claim without our written consent.
              </p>
            </div>
          </section>

          {/* Section 14: Additional Features */}
          <section id="additional-features" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Link2 className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">14. Additional Service Features & Links</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                The Service may link to third-party websites or services. These links are provided only as a convenience. The Company does not review, control, or warrant any third-party website, products, or advertisements. Linking does not imply endorsement or affiliation by the Company. We may remove links at any time in our sole discretion.
              </p>
            </div>
          </section>

          {/* Section 15: Dispute Resolution */}
          <section id="dispute-resolution" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Scale className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">15. Dispute Resolution & Mandatory Arbitration</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                <strong>a. Mandatory Arbitration:</strong> PLEASE READ THIS CAREFULLY. IT AFFECTS YOUR RIGHTS. YOU AND THE COMPANY AGREE THAT MANDATORY ARBITRATION (EXCEPT FOR MATTERS TAKEN TO SMALL CLAIMS COURT) WILL BE THE EXCLUSIVE DISPUTE RESOLUTION MECHANISM FOR ALL CLAIMS.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mt-3">
                <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl space-y-2">
                  <h4 className="font-bold text-gray-950 uppercase tracking-wide">Commencing Arbitration</h4>
                  <p>
                    Send a written notice of intent to arbitrate to: <strong>slimiot Private Limited, 429, Sector 11D, Faridabad, Haryana, India, Attn: Chief Executive Officer</strong>.
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Administered by the <strong>Indian Institute of Arbitration and Mediation (IIAM)</strong> under its Commercial Arbitration Rules.
                  </p>
                </div>

                <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl space-y-2">
                  <h4 className="font-bold text-gray-950 uppercase tracking-wide">Arbitration Proceeding</h4>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 pl-1 text-[11px]">
                    <li>Conducted in English by a single arbitrator in New Delhi.</li>
                    <li>Based on written submissions, phone, or online formats.</li>
                    <li>No personal appearances unless agreed in writing.</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-950 space-y-2 mt-4">
                <p className="font-bold">CLASS ACTION WAIVER:</p>
                <p className="uppercase font-semibold text-[11px]">
                  YOU AND THE COMPANY AGREE THAT CLAIMS MAY ONLY BE BROUGHT IN AN INDIVIDUAL CAPACITY, NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE PROCEEDING.
                </p>
              </div>

              <p className="text-xs pt-2">
                <strong>b. Equitable Relief:</strong> This section does not apply to claims where the Company seeks equitable/injunctive relief.
              </p>
              <p className="text-xs">
                <strong>c. Statute of Limitations:</strong> Any cause of action must commence within one year after it accrues; otherwise, it is permanently barred.
              </p>
              <p className="text-xs">
                <strong>d. Improper Filing:</strong> If you file a claim contrary to this arbitration section, the Company may recover attorneys' fees and costs up to INR 300,000.
              </p>
              <p className="text-xs">
                <strong>e. Rejecting Changes:</strong> You may reject amendments to this arbitration clause by sending a written notice within 30 days of the change. This will terminate your account immediately, and the prior arbitration terms will survive.
              </p>
            </div>
          </section>

          {/* Section 16: Governing Law */}
          <section id="governing-law" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <Scale className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">16. Governing Law; Choice of Forum</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                The laws of the State of New Delhi, India, excluding its conflicts of law rules, govern this Agreement. Any permitted legal court action will be subject to the exclusive jurisdiction of the state and federal courts located in New Delhi, and you submit to personal jurisdiction in such courts.
              </p>
            </div>
          </section>

          {/* Section 17: Feedback */}
          <section id="feedback" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">17. User Feedback Policy</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <p>
                If you submit feedback, ideas, comments, or feature requests, you agree that the Company owns all rights to such feedback, is not bound by confidentiality obligations, and can use/disclose it for any commercial or non-commercial purpose without compensation or attribution to you.
              </p>
            </div>
          </section>

          {/* Sections 18-23: Miscellaneous */}
          <section id="miscellaneous" className="scroll-mt-24 space-y-4">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-gray-100">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">18-23. Miscellaneous Clauses</h2>
            </div>
            <div className="text-gray-600 text-sm leading-relaxed space-y-4">
              <div className="space-y-4">
                <div className="border border-gray-100 rounded-xl p-4">
                  <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wide mb-1">18. Entire Agreement</h4>
                  <p className="text-xs">
                    This Agreement constitutes the entire agreement between you and the Company regarding the Service and supersedes all prior understandings.
                  </p>
                </div>

                <div className="border border-gray-100 rounded-xl p-4">
                  <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wide mb-1">19. Severability</h4>
                  <p className="text-xs">
                    If any provision is held invalid or unenforceable, it will be modified or severed to reflect the fullest express intent of the parties, and the remainder will stay in full force.
                  </p>
                </div>

                <div className="border border-gray-100 rounded-xl p-4">
                  <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wide mb-1">20. Relationship of Parties</h4>
                  <p className="text-xs">
                    Nothing creates an employer-employee, agency, joint venture, or partnership. Neither party has the authority to bind or incur liability for the other.
                  </p>
                </div>

                <div className="border border-gray-100 rounded-xl p-4">
                  <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wide mb-1">21. Waiver</h4>
                  <p className="text-xs">
                    No delay or failure to exercise a right or remedy operates as a waiver. Rights may be exercised whenever expedient.
                  </p>
                </div>

                <div className="border border-gray-100 rounded-xl p-4">
                  <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wide mb-1">22. Assignment</h4>
                  <p className="text-xs">
                    You may not assign or transfer your rights under this Agreement without prior written permission. The Company may transfer its rights under this agreement at any time without permission.
                  </p>
                </div>

                <div className="border border-gray-100 rounded-xl p-4">
                  <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wide mb-1">23. Third-Party Beneficiaries</h4>
                  <p className="text-xs">
                    Content providers are third-party beneficiaries of provisions relating to their rights, and are entitled to enforce them directly.
                  </p>
                </div>
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
            <a href="/admin/privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</a>
            <a href="mailto:support@slimiot.com" className="hover:text-gray-900 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
