import { ArrowLeft, FileText, Shield, Mail, MapPin, Phone } from 'lucide-react';

export function ImpressumPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-slate-200">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <button onClick={onBack} className="mb-8 flex items-center gap-2 text-sm text-slate-400 hover:text-blue-400 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/15 border border-blue-500/30">
            <FileText className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Impressum</h1>
            <p className="text-sm text-slate-500">Angaben gemäß § 5 TMG und DSGVO</p>
          </div>
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-100">
              <MapPin className="h-5 w-5 text-blue-400" /> Diensteanbieter
            </h2>
            <div className="space-y-1 text-sm text-slate-400">
              <p className="font-medium text-slate-300">[Name der Schule / Institution]</p>
              <p>[Straße und Hausnummer]</p>
              <p>[PLZ und Ort]</p>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-100">
              <Mail className="h-5 w-5 text-blue-400" /> Kontakt
            </h2>
            <div className="space-y-2 text-sm text-slate-400">
              <p><span className="text-slate-500">E-Mail:</span> [kontakt@schule.de]</p>
              <p><span className="text-slate-500">Telefon:</span> [+49 (0) ...]</p>
              <p><span className="text-slate-500">Fax:</span> [+49 (0) ...]</p>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-100">
              <Shield className="h-5 w-5 text-blue-400" /> Vertretungsberechtigte
            </h2>
            <div className="space-y-1 text-sm text-slate-400">
              <p>Schulleitung: [Name des Schulleiters / der Schulleiterin]</p>
              <p>Verwaltung: [Name der Verwaltungsleitung]</p>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-100">Registereintrag</h2>
            <div className="space-y-1 text-sm text-slate-400">
              <p>Registerart: [z. B. Vereinsregister]</p>
              <p>Registergericht: [Amtsgericht ...]</p>
              <p>Registernummer: [VR ...]</p>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-100">Umsatzsteuer-ID</h2>
            <div className="space-y-1 text-sm text-slate-400">
              <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:</p>
              <p className="font-mono text-slate-300">[DE...]</p>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-100">Verantwortlich für den Inhalt</h2>
            <div className="space-y-1 text-sm text-slate-400">
              <p>[Name der verantwortlichen Person]</p>
              <p>[Anschrift]</p>
              <p>E-Mail: [verantwortlich@schule.de]</p>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-3 text-lg font-semibold text-slate-100">Datenschutzerklärung (DSGVO)</h2>
            <div className="space-y-3 text-sm text-slate-400">
              <p>
                Der Schutz Ihrer personenbezogenen Daten ist uns wichtig. Die Verarbeitung erfolgt auf Grundlage
                der Datenschutz-Grundverordnung (DSGVO) sowie des Bundesdatenschutzgesetzes (BDSG).
              </p>
              <h3 className="font-medium text-slate-300">Verantwortlicher</h3>
              <p>
                Verantwortlich für die Datenverarbeitung auf dieser Website ist die oben genannte Institution.
                Bei Fragen zum Datenschutz wenden Sie sich bitte an die Kontaktadresse oben.
              </p>
              <h3 className="font-medium text-slate-300">Betroffenenrechte</h3>
              <p>
                Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
                Datenübertragbarkeit und Widerspruch. Ferner steht Ihnen ein Beschwerderecht bei der
                zuständigen Aufsichtsbehörde zu.
              </p>
              <h3 className="font-medium text-slate-300">Server-Logfiles</h3>
              <p>
                Der Provider dieser Seiten erhebt und speichert automatisch Informationen in sogenannten
                Server-Logfiles, die Ihr Browser automatisch übermittelt (z. B. Browsertyp, Betriebssystem,
                Uhrzeit der Anfrage). Diese Daten sind nicht bestimmten Personen zuordenbar.
              </p>
              <h3 className="font-medium text-slate-300">Cookies</h3>
              <p>
                Diese Anwendung verwendet technisch notwendige Cookies zur Aufrechterhaltung der Sitzung.
                Es findet kein Tracking statt. Eine Einwilligung für nicht-essentielle Cookies wird nicht
                eingeholt, da solche nicht verwendet werden.
              </p>
            </div>
          </section>

          <p className="text-center text-xs text-slate-600 pt-4">
            Die in eckigen Klammern [...] markierten Felder müssen durch die tatsächlichen Angaben der
            Institution ersetzt werden. Diese Vorlage stellt keine Rechtsberatung dar.
          </p>
        </div>
      </div>
    </div>
  );
}
