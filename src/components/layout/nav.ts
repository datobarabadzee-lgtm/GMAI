import type { LucideIcon } from 'lucide-react';
import {
  ShieldAlert,
  LayoutDashboard, BrainCircuit, FolderKanban, GitBranch, BookOpenCheck, Scale, Pill, ClipboardList,
  Calculator, FlaskConical, FileText, ShieldCheck, Gavel, HeartPulse, GraduationCap, Microscope,
  Building2, Library, Info,
} from 'lucide-react';

/**
 * WHO EACH SCREEN IS FOR
 *
 * Showing nineteen modules to everyone made the product unreadable: a patient
 * arriving at the site met a specialist's toolbox and could not tell what the
 * thing was for. Each item declares its audiences, and the shell renders only
 * the ones that belong to the visitor's chosen role.
 *
 * The role is a presentation filter, not a permission: it is stored in the
 * browser, it is switchable at any moment, and nothing is hidden for security
 * reasons. Access control lives in the tier policy, not here.
 */
export type Role = 'patient' | 'clinician' | 'quality' | 'student';

export const ROLES: { id: Role; labelKa: string; blurbKa: string }[] = [
  { id: 'patient', labelKa: 'პაციენტი', blurbKa: 'ამიხსენი ჩემი ანალიზი, წამლები და დიაგნოზი მარტივი ენით' },
  { id: 'clinician', labelKa: 'ექიმი', blurbKa: 'კლინიკური მსჯელობა, მედიკამენტები, დოკუმენტები, მტკიცებულება' },
  { id: 'quality', labelKa: 'ხარისხი და ადმინისტრაცია', blurbKa: 'დეფექტების ანალიზი, აუდიტი, პროტოკოლები, მედიკო-ლეგალური მიმოხილვა' },
  { id: 'student', labelKa: 'სტუდენტი / რეზიდენტი', blurbKa: 'სწავლება, ქეისები, ქვიზები, კვლევის მეთოდოლოგია' },
];

export type NavItem = {
  href: string;
  labelKa: string;
  labelEn: string;
  icon: LucideIcon;
  group: string;
  roles: Role[];
  /** Shown first for this role — the one screen that explains the product. */
  primaryFor?: Role[];
};

const ALL: Role[] = ['patient', 'clinician', 'quality', 'student'];

export const NAV: NavItem[] = [
  { href: '/', labelKa: 'მთავარი', labelEn: 'Home', icon: LayoutDashboard, group: 'ბირთვი', roles: ALL },
  { href: '/clinical', labelKa: 'კლინიკური AI', labelEn: 'Clinical AI', icon: BrainCircuit, group: 'ბირთვი', roles: ['clinician', 'student'], primaryFor: ['clinician'] },
  { href: '/case', labelKa: 'ქეისის სამუშაო სივრცე', labelEn: 'Case Workspace', icon: FolderKanban, group: 'ბირთვი', roles: ['clinician', 'quality'] },
  { href: '/ddx', labelKa: 'დიფერენციული დიაგნოზი', labelEn: 'Differential Diagnosis', icon: GitBranch, group: 'კლინიკური', roles: ['clinician', 'student'] },
  { href: '/evidence', labelKa: 'მტკიცებულება', labelEn: 'Evidence', icon: BookOpenCheck, group: 'კლინიკური', roles: ['clinician', 'student', 'quality'] },
  { href: '/guidelines', labelKa: 'გაიდლაინები', labelEn: 'Guidelines', icon: Scale, group: 'კლინიკური', roles: ['clinician', 'student', 'quality'] },
  { href: '/drugs', labelKa: 'მედიკამენტები', labelEn: 'Drugs', icon: Pill, group: 'კლინიკური', roles: ['clinician', 'student'] },
  { href: '/medication-review', labelKa: 'წამლების შემოწმება', labelEn: 'Medication Review', icon: ClipboardList, group: 'კლინიკური', roles: ALL },
  { href: '/medications', labelKa: 'მედიკამენტის ძიება', labelEn: 'Medication Search', icon: Pill, group: 'კლინიკური', roles: ALL },
  { href: '/calculators', labelKa: 'კალკულატორები', labelEn: 'Calculators', icon: Calculator, group: 'კლინიკური', roles: ['clinician', 'student'] },
  { href: '/labs', labelKa: 'ანალიზების ახსნა', labelEn: 'Laboratory AI', icon: FlaskConical, group: 'კლინიკური', roles: ALL },
  { href: '/documents', labelKa: 'დოკუმენტები', labelEn: 'Documents', icon: FileText, group: 'დოკუმენტაცია', roles: ['clinician', 'quality'] },
  { href: '/quality', labelKa: 'ხარისხი და უსაფრთხოება', labelEn: 'Quality & Safety', icon: ShieldCheck, group: 'ხარისხი', roles: ['quality', 'clinician'] },
  { href: '/defect', labelKa: 'დეფექტების ანალიზი', labelEn: 'Medical Defect Analysis', icon: Gavel, group: 'ხარისხი', roles: ['quality'], primaryFor: ['quality'] },
  { href: '/patient', labelKa: 'ამიხსენი მარტივად', labelEn: 'Patient AI', icon: HeartPulse, group: 'პლატფორმა', roles: ['patient', 'clinician'], primaryFor: ['patient'] },
  { href: '/academy', labelKa: 'სამედიცინო აკადემია', labelEn: 'Medical Academy', icon: GraduationCap, group: 'პლატფორმა', roles: ['student', 'clinician'], primaryFor: ['student'] },
  { href: '/academy/clinical', labelKa: 'კლინიკური ცოდნა', labelEn: 'Clinical Knowledge', icon: BookOpenCheck, group: 'პლატფორმა', roles: ['student', 'clinician'] },
  { href: '/research', labelKa: 'კვლევის AI', labelEn: 'Research AI', icon: Microscope, group: 'პლატფორმა', roles: ['student', 'clinician'] },
  { href: '/hospital', labelKa: 'AI ჰოსპიტალი', labelEn: 'AI Hospital', icon: Building2, group: 'პლატფორმა', roles: ['clinician', 'quality'] },
  { href: '/library', labelKa: 'ცოდნის ბიბლიოთეკა', labelEn: 'Knowledge Library', icon: Library, group: 'ცოდნა', roles: ['clinician', 'student', 'quality'] },
  { href: '/about', labelKa: 'შესახებ და მეთოდოლოგია', labelEn: 'About / Methodology', icon: Info, group: 'ცოდნა', roles: ALL },
  { href: '/privacy', labelKa: 'კონფიდენციალობა', labelEn: 'Privacy', icon: ShieldAlert, group: 'ცოდნა', roles: ALL },
];

export const NAV_GROUPS = [...new Set(NAV.map((n) => n.group))];

export function navForRole(role: Role | null): NavItem[] {
  if (!role) return NAV;
  return NAV.filter((n) => n.roles.includes(role));
}

export function groupsForRole(role: Role | null): string[] {
  return [...new Set(navForRole(role).map((n) => n.group))];
}

export function primaryFor(role: Role): NavItem | undefined {
  return NAV.find((n) => n.primaryFor?.includes(role));
}

/* ── Simplified menu (2026-10 redesign) ─────────────────────────────────────
 * Three audiences in the header switch; each sees five to seven entries. The
 * remaining modules stay reachable under „სხვა ხელსაწყოები" for clinicians and
 * by direct link — nothing is removed, it is just not in the way.
 */
import { Home, MessageCircle, FlaskConical as Flask, Pill as PillIcon, AlignLeft, Phone, Stethoscope, BookOpen, FileText as Doc, ShieldCheck as Shield, GraduationCap as Grad, Users, ListChecks, Microscope as Micro } from 'lucide-react';

export type Audience = 'patient' | 'clinician' | 'student';

export const AUDIENCES: { id: Audience; labelKa: string }[] = [
  { id: 'patient', labelKa: 'პაციენტი' },
  { id: 'clinician', labelKa: 'ექიმი' },
  { id: 'student', labelKa: 'სტუდენტი' },
];

/** The stored role, folded onto the three audiences the header offers. */
export function audienceOf(role: Role | null): Audience {
  if (role === 'clinician' || role === 'quality') return 'clinician';
  if (role === 'student') return 'student';
  return 'patient';
}

export type MenuItem = { href: string; labelKa: string; shortKa: string; icon: LucideIcon; external?: boolean };

export const WHATSAPP_URL = 'https://wa.me/995599412143';

export const MENU: Record<Audience, MenuItem[]> = {
  patient: [
    { href: '/', labelKa: 'მთავარი', shortKa: 'მთავარი', icon: Home },
    { href: '/patient', labelKa: 'AI-ს კითხვა', shortKa: 'კითხვა', icon: MessageCircle },
    { href: '/labs', labelKa: 'ანალიზების ახსნა', shortKa: 'ანალიზები', icon: Flask },
    { href: '/medication-review', labelKa: 'წამლების შემოწმება', shortKa: 'წამლები', icon: PillIcon },
    { href: '/patient?start=diagnosis', labelKa: 'ამიხსენი მარტივად', shortKa: 'ახსნა', icon: AlignLeft },
    { href: WHATSAPP_URL, labelKa: 'ექიმთან კავშირი', shortKa: 'ექიმი', icon: Phone, external: true },
  ],
  clinician: [
    { href: '/', labelKa: 'მთავარი', shortKa: 'მთავარი', icon: Home },
    { href: '/clinical', labelKa: 'კლინიკური AI', shortKa: 'AI', icon: Stethoscope },
    { href: '/medication-review', labelKa: 'მედიკამენტები', shortKa: 'წამლები', icon: PillIcon },
    { href: '/labs', labelKa: 'ლაბორატორია', shortKa: 'ლაბი', icon: Flask },
    { href: '/evidence', labelKa: 'მტკიცებულება', shortKa: 'წყაროები', icon: BookOpen },
    { href: '/documents', labelKa: 'დოკუმენტები', shortKa: 'დოკ.', icon: Doc },
    { href: '/quality', labelKa: 'ხარისხის აუდიტი', shortKa: 'აუდიტი', icon: Shield },
  ],
  student: [
    { href: '/', labelKa: 'მთავარი', shortKa: 'მთავარი', icon: Home },
    { href: '/academy', labelKa: 'სამედიცინო აკადემია', shortKa: 'აკადემია', icon: Grad },
    { href: '/academy/clinical', labelKa: 'კლინიკური ცოდნა', shortKa: 'ცოდნა', icon: BookOpenCheck },
    { href: '/medications', labelKa: 'მედიკამენტის ძიება', shortKa: 'წამლები', icon: PillIcon },
    { href: '/academy?mode=case', labelKa: 'კლინიკური ქეისები', shortKa: 'ქეისები', icon: Users },
    { href: '/academy?mode=quiz', labelKa: 'ქვიზი და OSCE', shortKa: 'ქვიზი', icon: ListChecks },
    { href: '/research', labelKa: 'კვლევა', shortKa: 'კვლევა', icon: Micro },
  ],
};

/** Everything else, for clinicians, folded away by default. */
export const MORE_TOOLS: MenuItem[] = [
  { href: '/case', labelKa: 'ქეისის სამუშაო სივრცე', shortKa: 'ქეისი', icon: FolderKanban },
  { href: '/ddx', labelKa: 'დიფერენციული დიაგნოზი', shortKa: 'DDx', icon: GitBranch },
  { href: '/guidelines', labelKa: 'გაიდლაინები', shortKa: 'გაიდლაინები', icon: Scale },
  { href: '/medications', labelKa: 'მედიკამენტის ძიება (ზუსტი პროდუქტი)', shortKa: 'ძიება', icon: Pill },
  { href: '/curation', labelKa: 'კურატორის გვერდი (ქართული დასახელებები)', shortKa: 'კურაცია', icon: ClipboardList },
  { href: '/drugs', labelKa: 'მედიკამენტების მონოგრაფიები', shortKa: 'მონოგრაფიები', icon: ClipboardList },
  { href: '/calculators', labelKa: 'კალკულატორები', shortKa: 'კალკულატორები', icon: Calculator },
  { href: '/defect', labelKa: 'დეფექტების ანალიზი', shortKa: 'დეფექტები', icon: Gavel },
  { href: '/research', labelKa: 'კვლევის AI', shortKa: 'კვლევა', icon: Microscope },
  { href: '/academy', labelKa: 'სამედიცინო აკადემია', shortKa: 'აკადემია', icon: GraduationCap },
  { href: '/academy/clinical', labelKa: 'კლინიკური ცოდნა (გადაუდებელი / ინტენსიური)', shortKa: 'კლინ. ცოდნა', icon: BookOpenCheck },
  { href: '/hospital', labelKa: 'AI ჰოსპიტალი', shortKa: 'ჰოსპიტალი', icon: Building2 },
  { href: '/library', labelKa: 'ცოდნის ბიბლიოთეკა', shortKa: 'ბიბლიოთეკა', icon: Library },
];

/** The AI page each audience lands on from „+ ახალი კითხვა" and the home input. */
export const ASK_HREF: Record<Audience, string> = { patient: '/patient', clinician: '/clinical', student: '/clinical' };
