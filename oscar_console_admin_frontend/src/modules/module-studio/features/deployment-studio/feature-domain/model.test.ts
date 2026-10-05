import { describe, expect, it } from 'vitest';
import {
  createArchitectureNode,
  createProject,
  createUnit,
  validateProject,
} from './model';
import type { ArchitectureEdge } from './types';

describe('modèle de configuration OSCAR', () => {
  it('crée un projet vide avec son bundle de déploiement', () => {
    const project = createProject(
      'Robot test',
      'Projet de test',
      'ENVIRONNEMENT_EXECUTION_ROBOT',
      'VIDE',
    );

    const [bundle] = project.nodes;
    expect(project.nodes).toHaveLength(1);
    expect(bundle?.data.kind).toBe('BUNDLE_DEPLOIEMENT');
    expect(bundle?.data.technicalCode).toBe('BUNDLE_DEPLOIEMENT_ROBOT_TEST');
  });

  it('crée automatiquement toute la structure minimale d’une unité', () => {
    const unit = createUnit(1, true);

    expect(unit.id).toMatch(/^unit-/);
    expect(unit.name).toBe('Unité 1');
    // Le préfixe dit déjà « unité » : le code ne répète pas le mot.
    expect(unit.technicalCode).toBe('INSTANCE_UNITE_1');
    expect(unit.unitType).toBe('TYPE_UNITE_STANDARD');
    expect(unit.processingName).toBe('TRAITEMENT_METIER_UNITE_PRINCIPAL');
    expect(unit.interfaceName).toBe('INTERFACE_COMMUNICATION_UNITE_PRINCIPALE');
    expect(unit.dataBandName).toMatch(/^BANDE_DONNEES_/);
    expect(unit.receiveBusName).toMatch(/^BUS_RECEPTION_/);
    expect(unit.sendBusName).toMatch(/^BUS_EMISSION_/);
    expect(unit.inputs).toHaveLength(1);
    expect(unit.outputs).toHaveLength(1);
    expect(unit.outputs[0]?.channelType).toBe('TYPE_SORTIE_PUBLICATION_TEMPS_REEL_CANAL_UNITE');
  });

  it('détecte une liaison dont les formats de données sont incompatibles', () => {
    const serviceA = createArchitectureNode(
      'INSTANCE_SERVICE',
      1,
      'ENVIRONNEMENT_EXECUTION_ROBOT',
      { x: 0, y: 0 },
    );
    const serviceB = createArchitectureNode(
      'INSTANCE_SERVICE',
      2,
      'ENVIRONNEMENT_EXECUTION_ROBOT',
      { x: 500, y: 0 },
    );
    const emitter = createUnit(1, true);
    const receiver = createUnit(2, true);
    const [emitterOutput] = emitter.outputs;
    const [receiverInput] = receiver.inputs;
    if (!emitterOutput || !receiverInput) throw new Error('Unité créée sans canal.');
    emitterOutput.dataFormat = 'BINAIRE_COMPACT';
    receiverInput.dataFormat = 'OBJET_JSON';
    serviceA.data.units = [emitter];
    serviceB.data.units = [receiver];

    const edge: ArchitectureEdge = {
      id: 'liaison-test',
      source: serviceA.id,
      sourceHandle: `out:${emitter.id}:${emitterOutput.id}`,
      target: serviceB.id,
      targetHandle: `in:${receiver.id}:${receiverInput.id}`,
      data: { edgeKind: 'DONNEES' },
    };
    const project = {
      ...createProject('Test', '', 'ENVIRONNEMENT_EXECUTION_ROBOT', 'VIDE'),
      nodes: [serviceA, serviceB],
      edges: [edge],
    };

    expect(validateProject(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'ERREUR', title: 'Formats de données incompatibles' }),
    ]));
  });
});
