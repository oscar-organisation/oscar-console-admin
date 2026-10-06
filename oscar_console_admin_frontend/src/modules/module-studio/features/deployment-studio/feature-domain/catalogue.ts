import {
  AppWindow,
  Box,
  Boxes,
  Cable,
  Cpu,
  LogIn,
  LogOut,
  PackageOpen,
  ServerCog,
} from 'lucide-react';
import { TYPES_DE_RECEPTION, TYPES_D_EMISSION } from './modele/canaux';
import type { InputChannelType, OutputChannelType, ProjectTarget } from './types';

export const TARGETS: Array<{ value: ProjectTarget; label: string; hint: string }> = [
  {
    value: 'ENVIRONNEMENT_EXECUTION_ROBOT',
    label: 'Ordinateur du robot',
    hint: 'Services exécutés près des capteurs et actionneurs.',
  },
  {
    value: 'ENVIRONNEMENT_EXECUTION_SERVEUR',
    label: 'Serveur OSCAR',
    hint: 'Traitements centralisés et services accessibles à distance.',
  },
  {
    value: 'ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB',
    label: 'Navigateur web',
    hint: 'Téléopération ou supervision depuis une interface web.',
  },
  {
    value: 'ENVIRONNEMENT_EXECUTION_APPLICATION_METIER',
    label: 'Autre application métier',
    hint: 'Logiciel web, bureau, mobile ou Python connecté à OSCAR.',
  },
];

// Les types de canaux vivent dans modele/canaux.ts, seul endroit où ils sont
// écrits : l'ancien éditeur les lit là, sous la forme qu'il attend.
export const INPUT_TYPES: Array<{ value: InputChannelType; label: string; hint: string }> =
  TYPES_DE_RECEPTION.map((choix) => ({ value: choix.code, label: choix.libelle, hint: choix.aide }));

export const OUTPUT_TYPES: Array<{ value: OutputChannelType; label: string; hint: string }> =
  TYPES_D_EMISSION.map((choix) => ({ value: choix.code, label: choix.libelle, hint: choix.aide }));

export const PALETTE_ITEMS = [
  {
    type: 'BUNDLE_DEPLOIEMENT',
    label: 'Bundle de déploiement',
    hint: 'Regroupe les composants publiés ensemble.',
    icon: PackageOpen,
    tone: 'violet',
  },
  {
    type: 'INSTANCE_SERVICE',
    label: 'Service',
    hint: 'Programme de fond déployable.',
    icon: ServerCog,
    tone: 'blue',
  },
  {
    type: 'INSTANCE_APPLICATION',
    label: 'Application',
    hint: 'Interface web, bureau ou métier.',
    icon: AppWindow,
    tone: 'cyan',
  },
  {
    type: 'INSTANCE_UNITE',
    label: 'Unité',
    hint: 'Traitement métier avec interface de communication.',
    icon: Cpu,
    tone: 'amber',
  },
  {
    type: 'CANAL_RECEPTION',
    label: 'Canal de réception',
    hint: 'Entrée unitaire d’une unité.',
    icon: LogIn,
    tone: 'green',
  },
  {
    type: 'CANAL_EMISSION',
    label: 'Canal d’émission',
    hint: 'Sortie unitaire d’une unité.',
    icon: LogOut,
    tone: 'rose',
  },
];

export const HIERARCHY_ITEMS = [
  { label: 'Bundle de déploiement', code: 'BUNDLE_DEPLOIEMENT', icon: Boxes },
  { label: 'Service ou application', code: 'INSTANCE_SERVICE / INSTANCE_APPLICATION', icon: Box },
  { label: 'Unité', code: 'INSTANCE_UNITE', icon: Cpu },
  { label: 'Interface de communication', code: 'INTERFACE_COMMUNICATION_UNITE', icon: Cable },
];
