// Country list used for (1) the address "country" field and (2) the phone dial-code
// selector, so WhatsApp links are always built from a correctly formatted E.164 number.
// Not exhaustive — CEMAC region first (where most downlines are), then common diaspora
// destinations for Cameroonian distributors. "Autre" covers anything missing.
const COUNTRIES = [
  { name: 'Cameroun', dial: '+237' },
  { name: 'Gabon', dial: '+241' },
  { name: 'Congo', dial: '+242' },
  { name: 'Tchad', dial: '+235' },
  { name: 'Republique Centrafricaine', dial: '+236' },
  { name: 'Guinee Equatoriale', dial: '+240' },
  { name: "Cote d'Ivoire", dial: '+225' },
  { name: 'Senegal', dial: '+221' },
  { name: 'Nigeria', dial: '+234' },
  { name: 'Benin', dial: '+229' },
  { name: 'Togo', dial: '+228' },
  { name: 'Mali', dial: '+223' },
  { name: 'Afrique du Sud', dial: '+27' },
  { name: 'France', dial: '+33' },
  { name: 'Belgique', dial: '+32' },
  { name: 'Allemagne', dial: '+49' },
  { name: 'Royaume-Uni', dial: '+44' },
  { name: 'Etats-Unis', dial: '+1' },
  { name: 'Canada', dial: '+1' },
  { name: 'Autre', dial: '' }
];
