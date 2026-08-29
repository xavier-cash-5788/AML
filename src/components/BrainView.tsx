import React, { useState, useEffect } from 'react';
import { useSystem } from '../engine/system';
import type { BrainZoneState } from '../engine/types';

// Définition géométrique des zones pour le SVG (points/nœuds)
const ZONES_CONFIG = {
  prefrontal: { label: 'Cortex Préfrontal\n(Contrôle, ToM)', x: 200, y: 80, r: 8, color: '#3b82f6' }, // Bleu
  hippocampus: { label: 'Hippocampe\n(Mémoire, Sommeil)', x: 160, y: 160, r: 6, color: '#10b981' }, // Vert
  amygdala: { label: 'Amygdale\n(Émotion, Peur)', x: 240, y: 160, r: 5, color: '#ef4444' }, // Rouge
  striatum: { label: 'Striatum\n(Habitudes, RL)', x: 200, y: 210, r: 7, color: '#eab308' }, // Jaune
  temporal: { label: 'Cortex Temporal\n(Sémantique)', x: 140, y: 240, r: 9, color: '#a855f7' }, // Violet
};

// Connexions définies entre les zones (synapses)
const CONNECTIONS = [
  ['prefrontal', 'hippocampus'],
  ['prefrontal', 'amygdala'],
  ['prefrontal', 'striatum'],
  ['hippocampus', 'amygdala'],
  ['hippocampus', 'temporal'],
  ['amygdala', 'striatum'],
  ['striatum', 'temporal'],
];

export const BrainView: React.FC = () => {
  const system = useSystem();
  const [activeZoneName, setActiveZoneName] = useState<string | null>(null);
  const [pulseConnections, setPulseConnections] = useState<Set<string>>(new Set());
  const zones = system.brainZones;

  // Effet pour animer les connexions quand une zone s'active
  useEffect(() => {
    const activeZones = Object.entries(zones)
      .filter(([_, state]) => (state as BrainZoneState).intensity > 0.15)
      .map(([key]) => key);

    if (activeZones.length >= 2) {
      // Activer les connexions entre zones actives
      const newPulses = new Set<string>();
      CONNECTIONS.forEach(([z1, z2]) => {
        if (activeZones.includes(z1) && activeZones.includes(z2)) {
          newPulses.add(`${z1}-${z2}`);
        }
      });
      setPulseConnections(newPulses);
      
      // Reset après 1.5s
      const timer = setTimeout(() => setPulseConnections(new Set()), 1500);
      return () => clearTimeout(timer);
    }
  }, [zones]);

  // Fonction pour calculer le style d'un nœud
  const getNodeStyle = (key: string, config: any) => {
    const state: BrainZoneState | undefined = zones[key as keyof typeof zones];
    const intensity = state?.intensity || 0;
    const isActive = intensity > 0.1;

    return {
      fill: config.color,
      fillOpacity: isActive ? 0.9 : 0.3,
      stroke: isActive ? '#ffffff' : config.color,
      strokeWidth: isActive ? 2 : 1,
      filter: isActive ? `drop-shadow(0 0 ${6 + intensity * 10}px ${config.color})` : 'none',
      transform: isActive ? `scale(${1 + intensity * 0.3})` : 'scale(1)',
      transformOrigin: `${config.x}px ${config.y}px`,
      transition: 'all 0.3s ease-out',
    };
  };

  // Fonction pour calculer le style d'une connexion
  const getConnectionStyle = (z1: string, z2: string, idx: number) => {
    const connKey = `${z1}-${z2}`;
    const isPulsing = pulseConnections.has(connKey);
    
    const state1 = zones[z1 as keyof typeof zones];
    const state2 = zones[z2 as keyof typeof zones];
    const intensity = Math.max(state1?.intensity || 0, state2?.intensity || 0);
    
    return {
      stroke: isPulsing ? '#60a5fa' : '#475569',
      strokeWidth: isPulsing ? 2 + intensity * 2 : 1,
      opacity: isPulsing ? 0.9 : 0.3 + (intensity * 0.4),
      filter: isPulsing ? 'drop-shadow(0 0 4px #60a5fa)' : 'none',
      transition: 'all 0.2s ease-in-out',
    };
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 h-full bg-slate-900 text-white">
      <h2 className="text-2xl font-bold mb-6 text-cyan-400">Réseau Neuronal en Temps Réel</h2>
      
      <div className="relative w-full max-w-md aspect-square">
        <svg viewBox="0 0 400 400" className="w-full h-full drop-shadow-2xl">
          {/* Forme globale du cerveau (contour subtil) */}
          <path 
            d="M100,200 C100,100 150,50 200,50 C250,50 300,100 300,200 C300,300 250,350 200,350 C150,350 100,300 100,200 Z" 
            fill="none" 
            stroke="#1e293b" 
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* Dessin des connexions (synapses) en premier plan arrière */}
          {CONNECTIONS.map(([z1, z2], idx) => {
            const config1 = ZONES_CONFIG[z1 as keyof typeof ZONES_CONFIG];
            const config2 = ZONES_CONFIG[z2 as keyof typeof ZONES_CONFIG];
            const style = getConnectionStyle(z1, z2, idx);
            
            return (
              <line
                key={`${z1}-${z2}`}
                x1={config1.x}
                y1={config1.y}
                x2={config2.x}
                y2={config2.y}
                style={style}
              />
            );
          })}

          {/* Rendu des zones (nœuds/points) */}
          {Object.entries(ZONES_CONFIG).map(([key, config]) => {
            const style = getNodeStyle(key, config);
            return (
              <g 
                key={key} 
                onMouseEnter={() => setActiveZoneName(key)} 
                onMouseLeave={() => setActiveZoneName(null)}
              >
                <circle
                  cx={config.x}
                  cy={config.y}
                  r={config.r}
                  style={style}
                  className="cursor-pointer"
                />
                {/* Label texte simple si intensité > 0.3 */}
                {(zones[key as keyof typeof zones]?.intensity || 0) > 0.3 && (
                  <text
                    x={config.x}
                    y={config.y - config.r - 8}
                    textAnchor="middle"
                    fill="white"
                    fontSize="9"
                    fontWeight="bold"
                    pointerEvents="none"
                    className="drop-shadow-md"
                    style={{ textShadow: '0 1px 2px black' }}
                  >
                    {key.substring(0, 3).toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Infobulle dynamique */}
        {activeZoneName && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur px-4 py-2 rounded-lg border border-white/20 text-center pointer-events-none z-10">
            <p className="font-bold text-cyan-300">{ZONES_CONFIG[activeZoneName as keyof typeof ZONES_CONFIG].label.split('\n')[0]}</p>
            <p className="text-xs text-gray-300 whitespace-pre-line">{ZONES_CONFIG[activeZoneName as keyof typeof ZONES_CONFIG].label.split('\n')[1]}</p>
            <p className="text-xs mt-1 text-yellow-400">
              Intensité: {Math.round((zones[activeZoneName as keyof typeof zones]?.intensity || 0) * 100)}%
            </p>
          </div>
        )}
      </div>

      {/* Légende détaillée */}
      <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-md">
        {Object.entries(ZONES_CONFIG).map(([key, config]) => {
          const intensity = zones[key as keyof typeof zones]?.intensity || 0;
          return (
            <div key={key} className="flex items-center space-x-3 bg-slate-800 p-2 rounded border border-slate-700">
              <div 
                className="w-3 h-3 rounded-full shadow-lg border border-white/30" 
                style={{ 
                  backgroundColor: config.color, 
                  opacity: 0.3 + (intensity * 0.7),
                  boxShadow: intensity > 0.1 ? `0 0 8px ${config.color}` : 'none'
                }}
              />
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-200">{key}</p>
                <div className="w-full bg-gray-700 h-1.5 rounded-full mt-1">
                  <div 
                    className="h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${intensity * 100}%`, backgroundColor: config.color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
