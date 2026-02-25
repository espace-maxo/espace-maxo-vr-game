import { useState } from "react";
import { 
  Users, Send, FileText, Phone, Mail, User, Briefcase, 
  MessageSquare, CheckCircle, Upload, X, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const positions = [
  { value: "serveur", label: "Serveur / Serveuse" },
  { value: "cuisinier", label: "Cuisinier / Cuisinière" },
  { value: "barman", label: "Barman / Barmaid" },
  { value: "caissier", label: "Caissier / Caissière" },
  { value: "livreur", label: "Livreur" },
  { value: "animateur_vr", label: "Animateur VR / Jeux" },
  { value: "manager", label: "Manager / Responsable" },
  { value: "autre", label: "Autre" }
];

const JoinUsPage = () => {
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    email: "",
    position: "",
    message: ""
  });
  const [cvFile, setCvFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Seuls les fichiers PDF sont acceptés");
        return;
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB max
        toast.error("Le fichier ne doit pas dépasser 5 Mo");
        return;
      }
      setCvFile(file);
      toast.success("CV sélectionné");
    }
  };

  const removeFile = () => {
    setCvFile(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.full_name || !formData.phone || !formData.email || !formData.position) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    setSubmitting(true);

    try {
      let cvData = null;
      let cvFilename = null;

      // Convert file to base64 if provided
      if (cvFile) {
        cvFilename = cvFile.name;
        cvData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(cvFile);
        });
      }

      const payload = {
        ...formData,
        cv_filename: cvFilename,
        cv_data: cvData
      };

      await axios.post(`${API}/job-applications`, payload);
      
      setSubmitted(true);
      toast.success("Candidature envoyée avec succès !");
    } catch (error) {
      console.error("Error submitting application:", error);
      toast.error(error.response?.data?.detail || "Erreur lors de l'envoi. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen pt-20 bg-dark-bg" data-testid="join-us-page">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <Card className="bg-dark-card border-green-500/30">
            <CardContent className="p-8 text-center">
              <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
              <h2 className="font-orbitron text-2xl text-white mb-4">
                Candidature Envoyée !
              </h2>
              <p className="text-gray-300 mb-6">
                Merci pour votre intérêt à rejoindre l'équipe Espace Maxo. 
                Nous examinerons votre candidature et vous contacterons très prochainement.
              </p>
              <Button
                onClick={() => {
                  setSubmitted(false);
                  setFormData({
                    full_name: "",
                    phone: "",
                    email: "",
                    position: "",
                    message: ""
                  });
                  setCvFile(null);
                }}
                className="bg-neon-blue hover:bg-neon-blue/80"
              >
                Envoyer une autre candidature
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-dark-bg" data-testid="join-us-page">
      {/* Hero Section */}
      <section className="py-12 px-4 bg-gradient-to-br from-neon-blue/20 via-dark-bg to-purple-500/10">
        <div className="max-w-4xl mx-auto text-center">
          <Users className="w-16 h-16 text-neon-blue mx-auto mb-4" />
          <h1 className="font-orbitron font-black text-3xl sm:text-4xl lg:text-5xl uppercase tracking-tight mb-4">
            <span className="text-white">Nous</span>{" "}
            <span className="text-neon-blue">Rejoindre</span>
          </h1>
          <p className="text-gray-300 font-outfit text-lg max-w-2xl mx-auto">
            Rejoignez l'aventure Espace Maxo ! Nous recherchons des personnes passionnées 
            pour compléter notre équipe dynamique.
          </p>
        </div>
      </section>

      {/* Application Form */}
      <section className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <Card className="bg-dark-card border-white/10">
            <CardHeader>
              <CardTitle className="font-orbitron text-xl text-white flex items-center gap-2">
                <Briefcase className="w-6 h-6 text-neon-blue" />
                Formulaire de Candidature
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Full Name */}
                <div className="space-y-2">
                  <Label htmlFor="full_name" className="text-gray-300 flex items-center gap-2">
                    <User className="w-4 h-4 text-neon-blue" />
                    Nom complet *
                  </Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleInputChange}
                    placeholder="Votre nom et prénom"
                    className="bg-surface-highlight border-white/20 text-white"
                    required
                    data-testid="input-full-name"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-gray-300 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-neon-blue" />
                    Téléphone *
                  </Label>
                  <Input
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="97 XX XX XX"
                    className="bg-surface-highlight border-white/20 text-white"
                    required
                    data-testid="input-phone"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-300 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-neon-blue" />
                    Email *
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="votre.email@exemple.com"
                    className="bg-surface-highlight border-white/20 text-white"
                    required
                    data-testid="input-email"
                  />
                </div>

                {/* Position */}
                <div className="space-y-2">
                  <Label className="text-gray-300 flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-neon-blue" />
                    Poste souhaité *
                  </Label>
                  <Select
                    value={formData.position}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, position: value }))}
                    required
                  >
                    <SelectTrigger 
                      className="bg-surface-highlight border-white/20 text-white"
                      data-testid="select-position"
                    >
                      <SelectValue placeholder="Sélectionnez un poste" />
                    </SelectTrigger>
                    <SelectContent className="bg-dark-card border-white/20">
                      {positions.map((pos) => (
                        <SelectItem 
                          key={pos.value} 
                          value={pos.value}
                          className="text-white hover:bg-white/10"
                        >
                          {pos.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* CV Upload */}
                <div className="space-y-2">
                  <Label className="text-gray-300 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-neon-blue" />
                    CV (PDF, max 5 Mo)
                  </Label>
                  
                  {cvFile ? (
                    <div className="flex items-center gap-3 p-3 bg-neon-blue/10 border border-neon-blue/30 rounded-lg">
                      <FileText className="w-8 h-8 text-neon-blue" />
                      <div className="flex-1">
                        <p className="text-white font-medium">{cvFile.name}</p>
                        <p className="text-gray-400 text-sm">
                          {(cvFile.size / 1024 / 1024).toFixed(2)} Mo
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={removeFile}
                        className="p-1 hover:bg-red-500/20 rounded text-red-400"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <label 
                      className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:border-neon-blue/50 transition-colors"
                      data-testid="cv-upload-area"
                    >
                      <Upload className="w-10 h-10 text-gray-400 mb-2" />
                      <span className="text-gray-400 text-center">
                        Cliquez pour télécharger votre CV
                      </span>
                      <span className="text-gray-500 text-sm mt-1">PDF uniquement</span>
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        data-testid="cv-file-input"
                      />
                    </label>
                  )}
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <Label htmlFor="message" className="text-gray-300 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-neon-blue" />
                    Message / Motivation (optionnel)
                  </Label>
                  <Textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    placeholder="Parlez-nous de vous, de votre expérience et de votre motivation..."
                    className="bg-surface-highlight border-white/20 text-white min-h-[120px]"
                    data-testid="input-message"
                  />
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={submitting || !formData.full_name || !formData.phone || !formData.email || !formData.position}
                  className="w-full bg-neon-blue hover:bg-neon-blue/80 text-white font-rajdhani font-bold uppercase py-6 text-lg"
                  data-testid="submit-application-btn"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      Envoyer ma candidature
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Info Section */}
          <div className="mt-8 text-center text-gray-400">
            <p className="mb-2">Des questions ? Contactez-nous :</p>
            <p className="text-neon-blue font-semibold">01 41 47 00 00</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default JoinUsPage;
