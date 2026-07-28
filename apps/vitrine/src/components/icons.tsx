import {
  Sparkles, Menu, X, Target, FlaskConical, Lightbulb, Users, Rocket, Languages,
  Cpu, Cog, Zap, Check, ArrowLeft, MapPin, Mail, GraduationCap, Phone, Sprout,
  Bot, Atom, BrainCircuit, HeartPulse, Hexagon, Satellite, Home, HeartHandshake,
  UsersRound, Plane, Handshake, Wrench, Hammer, TrendingUp, Coins, Scale, Award,
  MessageCircle, Send, type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles, menu: Menu, x: X, target: Target, "flask-conical": FlaskConical,
  lightbulb: Lightbulb, users: Users, rocket: Rocket, languages: Languages, cpu: Cpu,
  cog: Cog, zap: Zap, check: Check, "arrow-left": ArrowLeft, "map-pin": MapPin, mail: Mail,
  "graduation-cap": GraduationCap, phone: Phone, sprout: Sprout, bot: Bot, atom: Atom,
  "brain-circuit": BrainCircuit, "heart-pulse": HeartPulse, hexagon: Hexagon, satellite: Satellite,
  home: Home, "heart-handshake": HeartHandshake, "users-round": UsersRound, plane: Plane,
  handshake: Handshake, wrench: Wrench, hammer: Hammer, "trending-up": TrendingUp, coins: Coins,
  scale: Scale, award: Award, "message-circle": MessageCircle, send: Send,
};

export function Icon({ name, size = 24, color, style }: { name: string; size?: number; color?: string; style?: React.CSSProperties }) {
  const C = MAP[name] ?? Sparkles;
  return <C size={size} color={color} strokeWidth={1.6} style={style} />;
}
