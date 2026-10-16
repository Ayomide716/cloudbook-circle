/**
 * Ember's icons, one family everywhere (see the design system): Solar line icons at a 1.9 line,
 * solid when filled, and Phosphor Bold's magnifier for search. Small utility glyphs (close, check,
 * chevrons, arrows, spinners) come from lucide, whose line matches.
 *
 * Import icons from here, never from lucide-react or Phosphor directly.
 */
export * from "lucide-react";
// Named, so they win over lucide's icons of the same name.
export {
  PlusCircle, Users, User, UserPlus, UserMinus, UserCheck, Trash2, Play, MoreHorizontal, MessageCircle, Video, Send, Star, Phone, PhoneOff, Flag, Eye, EyeOff, Share2, Share, Pencil, Edit, PenLine, Heart, Globe, FileText, Clock, Volume2, VolumeX, Shield, ShieldCheck, Pause, MapPin, Mail, ImagePlus, Image, Images, Bookmark, BookmarkCheck, Sparkles, Monitor, Mic, Home, Flame, Camera, Bell, BellOff, BellRing, ThumbsUp, Settings, LogOut, Link2, Link, History, Film, MonitorPlay, Download, Upload, Compass, CalendarDays, CalendarPlus, BarChart3, Lock, KeyRound, Palette, Moon, Sun, ShoppingBag, Copy, Archive, ArchiveRestore, Pin, Smile, SmilePlus, Paperclip, Info, AlertTriangle, AlertCircle, Tag, LayoutDashboard, GraduationCap, Hash, Forward, Smartphone, Ban, Radio, TrendingUp, Timer, RefreshCw, RotateCcw, Undo2, BookOpen, Cake, HeartHandshake, DollarSign, MessageSquarePlus,
} from "./solar";
export { Search } from "./search";
export { ICON_STROKE, type IconProps } from "./solar-icon";
