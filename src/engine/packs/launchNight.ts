// "Launch Night": a tech startup's product launch party. The founder is found dead in the green room.
import type { NoteIcon, QuestionDim, TraitDim } from '../../shared/types.ts';

export interface PackCharacter {
  name: string;
  job: string;
}

export interface Pack {
  id: string;
  title: string;
  intro: string;
  victim: string;
  characters: PackCharacter[];
  traitValues: Record<TraitDim, string[]>;
  socialSpots: string[];
  solitarySpots: string[];
  killerTemplates: Record<TraitDim, { icon: NoteIcon; text: (v: string) => string }[]>;
  recordTemplates: Record<QuestionDim, { icon: NoteIcon; text: (name: string, v: string) => string }>;
  alibiTemplates: { icon: NoteIcon; text: (name: string, spot: string) => string }[];
  questions: Record<QuestionDim, string>;
}

const arrivalItem: Record<string, string> = {
  Uber: 'an Uber receipt (drop-off 19:48)',
  'E-scooter': 'an e-scooter unlock tag',
  'Own car': 'a car-park exit ticket',
  Train: 'a train ticket stub',
};

export const launchNight: Pack = {
  id: 'launch-night',
  title: 'Launch Night',
  intro:
    'Nimbus AI is launching its first product with a party on the 30th floor. At 21:40, founder Marcus Vale is found dead in the green room. CCTV shows someone slipping into the corridor at 21:34. Everyone is a suspect.',
  victim: 'Marcus Vale, founder of Nimbus AI',
  characters: [
    { name: 'Maya Chen', job: 'CTO' },
    { name: 'Jordan Reyes', job: 'Head of Sales' },
    { name: 'Priya Nair', job: 'Lead Engineer' },
    { name: 'Tom Hartley', job: 'Investor' },
    { name: 'Sofia Rossi', job: 'Head of Marketing' },
    { name: 'Dev Patel', job: 'Product Manager' },
    { name: 'Chris Walker', job: 'Sales Director' },
    { name: 'Nina Okafor', job: 'Designer' },
    { name: 'Omar Haddad', job: 'Data Scientist' },
    { name: 'Kate Morgan', job: 'Events Manager' },
    { name: 'Ben Fraser', job: 'Angel Investor' },
    { name: 'Hannah Lee', job: 'Brand Strategist' },
    { name: 'Raj Mehta', job: 'Backend Engineer' },
    { name: 'Ellie Brooks', job: 'PR Consultant' },
    { name: 'Luke Grant', job: 'Account Executive' },
    { name: 'Gemma Price', job: 'CFO' },
    { name: 'Zoe Martin', job: 'Community Manager' },
    { name: 'Kwame Asante', job: 'Security Engineer' },
    { name: 'Fatima Aziz', job: 'Venture Partner' },
    { name: 'Alex Kim', job: 'Growth Hacker' },
    { name: 'Lewis Shaw', job: 'Chief of Staff' },
    { name: 'Jo Taylor', job: 'Copywriter' },
    { name: 'Sam Carter', job: 'Tech Journalist' },
    { name: 'Nadia Volkov', job: 'Legal Counsel' },
  ],
  traitValues: {
    coat: ['Red', 'White', 'Black', 'Green'],
    arrival: ['Uber', 'E-scooter', 'Own car', 'Train'],
    drink: ['Espresso martini', 'Gin & tonic', 'Beer', 'Sparkling water'],
    phone: ['iPhone', 'Samsung', 'Pixel', 'Nothing Phone'],
    team: ['Engineering', 'Sales', 'Marketing', 'Investors'],
  },
  socialSpots: ['Rooftop bar', 'Demo stage', 'Dance floor', 'Lobby bar'],
  solitarySpots: ['Smoking area', 'Cloakroom', 'Car park', 'Bathroom corridor'],
  killerTemplates: {
    coat: [
      { icon: 'cctv', text: (v) => `CCTV, service corridor, 21:34: a figure in a ${v.toLowerCase()} coat heads for the green room.` },
      { icon: 'witness', text: (v) => `Cleaner's statement: someone in a ${v.toLowerCase()} coat brushed past the green-room door at 21:35.` },
      { icon: 'coat', text: (v) => `Forensics: fibres from a ${v.toLowerCase()} coat were found on the victim's sleeve.` },
      { icon: 'cctv', text: (v) => `Lift camera, 21:33: a blurred figure in a ${v.toLowerCase()} coat rides to floor 30.` },
    ],
    arrival: [
      { icon: 'receipt', text: (v) => `Dropped in the corridor outside the green room: ${arrivalItem[v]}.` },
      { icon: 'receipt', text: (v) => `Forensics: the killer's gloves had traces of ${arrivalItem[v]} in the pocket.` },
      { icon: 'witness', text: (v) => `Doorman: "The person who ran out at 21:38 had ${arrivalItem[v]} in their hand."` },
      { icon: 'receipt', text: (v) => `Found under the green-room sofa: ${arrivalItem[v]}.` },
    ],
    drink: [
      { icon: 'glass', text: (v) => `The glass beside the body held ${v.toLowerCase()}. Wiped clean of prints.` },
      { icon: 'glass', text: (v) => `Bar CCTV, 21:25: the killer's hand grabs a ${v.toLowerCase()} from the bar.` },
      { icon: 'witness', text: (v) => `Bartender: "Whoever went backstage at 21:30 was drinking ${v.toLowerCase()}."` },
      { icon: 'glass', text: (v) => `A half-finished ${v.toLowerCase()} was left on the green-room table.` },
    ],
    phone: [
      { icon: 'phone', text: (v) => `The victim's laptop was unlocked from a ${v} at 21:36.` },
      { icon: 'phone', text: (v) => `Wi-Fi log: an unknown ${v} joined the green-room network at 21:33.` },
      { icon: 'phone', text: (v) => `A cracked ${v} screen protector was found by the green-room door.` },
      { icon: 'phone', text: (v) => `Bluetooth log: a ${v} was paired with the green-room speaker at 21:34.` },
    ],
    team: [
      { icon: 'badge', text: (v) => `Door log: a ${v} badge opened the green-room side door at 21:31.` },
      { icon: 'badge', text: (v) => `A ${v} team lanyard was snagged on the green-room door handle.` },
      { icon: 'witness', text: (v) => `Security guard: "The person backstage had a ${v} lanyard, I'm sure of it."` },
      { icon: 'badge', text: (v) => `Access audit: only a ${v} pass could reach the green room after 21:30.` },
    ],
  },
  recordTemplates: {
    coat: { icon: 'coat', text: (n, v) => `Coat check ticket: ${n} — ${v.toLowerCase()} coat.` },
    arrival: { icon: 'receipt', text: (n, v) => `Arrivals log: ${n} arrived by ${v.toLowerCase()}.` },
    drink: { icon: 'glass', text: (n, v) => `Bar tab: ${n} — ${v.toLowerCase()} ×2.` },
    phone: { icon: 'phone', text: (n, v) => `Charging locker 12: ${n}'s ${v}.` },
    team: { icon: 'badge', text: (n, v) => `Guest list: ${n} — ${v}.` },
    location: { icon: 'photo', text: (n, v) => `Photo booth strip, 21:30: ${n} at the ${v.toLowerCase()}.` },
  },
  alibiTemplates: [
    { icon: 'witness', text: (n, s) => `Attendant at the ${s.toLowerCase()}: "${n} was with me from 21:28 until 21:41. Never left."` },
    { icon: 'cctv', text: (n, s) => `CCTV, ${s.toLowerCase()}, 21:29–21:42: ${n} is on camera the whole time.` },
  ],
  questions: {
    coat: 'What coat were you wearing?',
    arrival: 'How did you get here tonight?',
    location: 'Where were you at 21:30?',
    drink: 'What were you drinking?',
    phone: 'What phone do you have?',
    team: 'Which team are you with?',
  },
};
