import { useEffect } from 'react';
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import {
  AppWindow,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Cpu,
  Database,
  Mic,
  PackageOpen,
  Plus,
  Radio,
  ServerCog,
  Video,
} from 'lucide-react';
import { formatLabel } from '../../feature-domain/model';
import type { ArchitectureNode as ArchitectureNodeType, ChannelConfig } from '../../feature-domain/types';

const KIND_LABELS = {
  BUNDLE_DEPLOIEMENT: 'Bundle de déploiement',
  INSTANCE_SERVICE: 'Service',
  INSTANCE_APPLICATION: 'Application',
};

function ChannelRow({
  channel,
  unitId,
  onSelect,
}: {
  channel: ChannelConfig;
  unitId: string;
  onSelect: () => void;
}) {
  const receiving = channel.direction === 'RECEPTION';
  return (
    <button
      className={`channel-row nodrag ${receiving ? 'channel-row--input' : 'channel-row--output'}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      title={`${channel.technicalCode} · ${formatLabel(channel.dataFormat)}`}
      type="button"
    >
      {receiving && (
        <Handle
          className="channel-handle channel-handle--input"
          id={`in:${unitId}:${channel.id}`}
          type="target"
          position={Position.Left}
        />
      )}
      <span className="channel-dot" />
      <span className="channel-copy">
        <strong>{channel.name}</strong>
        <small>{formatLabel(channel.dataFormat)}</small>
      </span>
      {!receiving && (
        <Handle
          className="channel-handle channel-handle--output"
          id={`out:${unitId}:${channel.id}`}
          type="source"
          position={Position.Right}
        />
      )}
    </button>
  );
}

export default function ArchitectureNode({ id, data, selected }: NodeProps<ArchitectureNodeType>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const isBundle = data.kind === 'BUNDLE_DEPLOIEMENT';
  const Icon = data.kind === 'INSTANCE_SERVICE'
    ? ServerCog
    : data.kind === 'INSTANCE_APPLICATION'
      ? AppWindow
      : PackageOpen;

  useEffect(() => {
    updateNodeInternals(id);
  }, [data.units, id, updateNodeInternals]);

  return (
    <article
      className={`architecture-node architecture-node--${data.kind.toLowerCase()} ${selected ? 'is-selected' : ''}`}
      onDoubleClick={() => data.onSelect?.({ type: 'node', nodeId: id })}
    >
      {!isBundle && (
        <Handle className="structure-handle structure-handle--input" id="component-input" type="target" position={Position.Left} />
      )}

      <header className="architecture-node__header">
        <span className="architecture-node__icon"><Icon size={18} /></span>
        <span className="architecture-node__heading">
          <span className="architecture-node__eyebrow">{KIND_LABELS[data.kind]}</span>
          <strong>{data.name}</strong>
        </span>
        <span className={`node-state ${data.status === 'PRET' ? 'node-state--ready' : ''}`}>
          {data.status === 'PRET' ? 'Prêt' : 'Brouillon'}
        </span>
      </header>

      <div className="architecture-node__meta">
        <code>{data.technicalCode}</code>
        <span>{data.target.replace('ENVIRONNEMENT_EXECUTION_', '').replaceAll('_', ' ').toLowerCase()}</span>
      </div>

      {data.description && <p className="architecture-node__description">{data.description}</p>}

      {isBundle ? (
        <div className="bundle-summary">
          <PackageOpen size={20} />
          <span>Les traits pointillés indiquent les composants publiés avec ce bundle.</span>
        </div>
      ) : (
        <div className="unit-list">
          {data.units.map((unit) => (
            <section
              className="unit-card nodrag"
              key={unit.id}
              onClick={(event) => {
                event.stopPropagation();
                data.onSelect?.({ type: 'unit', nodeId: id, unitId: unit.id });
              }}
            >
              <div className="unit-card__header">
                <button
                  className="icon-button icon-button--tiny nodrag"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onToggleUnit?.(id, unit.id);
                  }}
                  title={unit.expanded ? 'Réduire la structure' : 'Afficher la structure'}
                  type="button"
                >
                  {unit.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span className="unit-card__icon"><Cpu size={15} /></span>
                <span className="unit-card__title">
                  <strong>{unit.name}</strong>
                  <code>{unit.technicalCode}</code>
                </span>
                <span className="unit-card__media">
                  {unit.canPublishAudio && <Mic size={13} aria-label="Peut émettre de l’audio" />}
                  {unit.canPublishVideo && <Video size={13} aria-label="Peut émettre de la vidéo" />}
                </span>
              </div>

              {unit.expanded && (
                <div className="unit-scaffold">
                  <div><CircleDot size={12} /><span>{unit.processingName.replaceAll('_', ' ').toLowerCase()}</span></div>
                  <div><Radio size={12} /><span>{unit.interfaceName.replaceAll('_', ' ').toLowerCase()}</span></div>
                  <div><Database size={12} /><span>{unit.dataBandName.replaceAll('_', ' ').toLowerCase()}</span></div>
                </div>
              )}

              <div className="bus-grid">
                <div className="bus-column bus-column--input">
                  <div className="bus-title">
                    <span>Réception</span><small>{unit.inputs.length}</small>
                  </div>
                  {unit.inputs.length ? unit.inputs.map((channel) => (
                    <ChannelRow
                      key={channel.id}
                      channel={channel}
                      unitId={unit.id}
                      onSelect={() => data.onSelect?.({ type: 'channel', nodeId: id, unitId: unit.id, channelId: channel.id })}
                    />
                  )) : <span className="empty-port">Aucune entrée</span>}
                </div>
                <div className="bus-column bus-column--output">
                  <div className="bus-title">
                    <span>Émission</span><small>{unit.outputs.length}</small>
                  </div>
                  {unit.outputs.length ? unit.outputs.map((channel) => (
                    <ChannelRow
                      key={channel.id}
                      channel={channel}
                      unitId={unit.id}
                      onSelect={() => data.onSelect?.({ type: 'channel', nodeId: id, unitId: unit.id, channelId: channel.id })}
                    />
                  )) : <span className="empty-port">Aucune sortie</span>}
                </div>
              </div>
            </section>
          ))}

          {data.units.length === 0 && (
            <div className="unit-empty">
              <Cpu size={20} />
              <span>Déposez une unité ici ou utilisez le bouton.</span>
            </div>
          )}

          <button
            className="add-unit-button nodrag"
            onClick={(event) => {
              event.stopPropagation();
              data.onAddUnit?.(id);
            }}
            type="button"
          >
            <Plus size={15} /> Ajouter une unité
          </button>
        </div>
      )}

      {isBundle && (
        <Handle className="structure-handle structure-handle--output" id="bundle-output" type="source" position={Position.Right} />
      )}
    </article>
  );
}
