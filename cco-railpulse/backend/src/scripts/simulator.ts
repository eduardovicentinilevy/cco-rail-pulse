/**
 * SIMULADOR DE TRÁFEGO CBTC (FROTA I - LINHA 2 VERDE)
 * Injeção Direta no Barramento SIL 4 (Redis Pub/Sub)
 */
import { createClient } from 'redis';

// Malha Geodésica: Linha 2 - Verde (Vila Prudente -> Vila Madalena)
const stations = [
  { id: 'VPT', name: 'Vila Prudente', lat: -23.5847, lng: -46.5822 },
  { id: 'TMD', name: 'Tamanduateí', lat: -23.5928, lng: -46.5894 },
  { id: 'SAC', name: 'Sacomã', lat: -23.6015, lng: -46.6026 },
  { id: 'AIP', name: 'Alto do Ipiranga', lat: -23.6022, lng: -46.6125 },
  { id: 'IMG', name: 'Santos-Imigrantes', lat: -23.5956, lng: -46.6200 },
  { id: 'CKL', name: 'Chácara Klabin', lat: -23.5930, lng: -46.6300 },
  { id: 'ANR', name: 'Ana Rosa', lat: -23.5813, lng: -46.6383 },
  { id: 'PSO', name: 'Paraíso', lat: -23.5717, lng: -46.6397 },
  { id: 'BGD', name: 'Brigadeiro', lat: -23.5684, lng: -46.6496 },
  { id: 'TRI', name: 'Trianon-Masp', lat: -23.5633, lng: -46.6540 },
  { id: 'CNS', name: 'Consolação', lat: -23.5583, lng: -46.6620 },
  { id: 'CLI', name: 'Clínicas', lat: -23.5552, lng: -46.6710 },
  { id: 'SUM', name: 'Sumaré', lat: -23.5515, lng: -46.6775 },
  { id: 'VMD', name: 'Vila Madalena', lat: -23.5448, lng: -46.6898 }
];

type TrainState = 'ACCELERATING' | 'CRUISING' | 'BRAKING' | 'STOPPED';

interface Train {
  id: number;
  speed: number;
  lat: number;
  lng: number;
  doors: boolean;
  state: TrainState;
  dwellTimer: number;
  targetIndex: number;
}

// Inicia 3 trens espaçados na via para gerar curvas de Headway consistentes
const trains: Train[] = [
  { id: 201, speed: 0, lat: stations[0].lat, lng: stations[0].lng, doors: true, state: 'STOPPED', dwellTimer: 0, targetIndex: 0 },
  { id: 202, speed: 0, lat: stations[4].lat, lng: stations[4].lng, doors: true, state: 'STOPPED', dwellTimer: 0, targetIndex: 4 },
  { id: 203, speed: 0, lat: stations[8].lat, lng: stations[8].lng, doors: true, state: 'STOPPED', dwellTimer: 0, targetIndex: 8 }
];

const runSimulator = async () => {
  console.log('🚄 Conectando barramento Redis...');
  const publisher = createClient({ url: 'redis://127.0.0.1:6379' });
  
  publisher.on('error', (err) => console.error('[REDIS FATAL] Erro no simulador:', err));
  await publisher.connect();
  
  console.log('✅ Barramento conectado. Iniciando Inteligência de Roteamento CBTC...');
  console.log('🛤️  Linha Ativa: 2 - Verde (Frota I)');

  const simulatePhysics = async () => {
    for (const train of trains) {
      const target = stations[train.targetIndex];
      
      // Geometria Analítica: Vetor de Direção e Distância Euclidiana
      const dx = target.lng - train.lng;
      const dy = target.lat - train.lat;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Motor de Decisão (State Machine)
      if (train.state === 'STOPPED') {
        train.speed = 0;
        train.doors = true;
        train.dwellTimer += 1;
        
        // Dwell Time programado de 30 segundos
        if (train.dwellTimer > 30) {
          train.doors = false;
          train.state = 'ACCELERATING';
          train.dwellTimer = 0;
          // Define a próxima estação (Loop contínuo ao chegar na Vila Madalena)
          train.targetIndex = (train.targetIndex + 1) % stations.length;
        }
      } else {
        // Zonas de aproximação (Thresholds geográficos)
        if (distance < 0.001) {
          train.state = 'BRAKING';
        } else if (train.speed < 60 && train.state !== 'BRAKING') {
          train.state = 'ACCELERATING';
        } else if (train.state !== 'BRAKING') {
          train.state = 'CRUISING';
        }

        // Dinâmica de Frenagem e Aceleração
        if (train.state === 'ACCELERATING') train.speed += 2.5;
        else if (train.state === 'BRAKING') train.speed -= 4.0;
        else if (train.state === 'CRUISING') train.speed += (Math.random() - 0.5) * 1.5;

        // Limitador Físico de Velocidade da Via (VMA)
        train.speed = Math.max(3, Math.min(75, train.speed));

        // Verificação de Atracação na Plataforma
        if (distance < 0.0002 && train.state === 'BRAKING') {
          train.state = 'STOPPED';
          train.speed = 0;
          train.lat = target.lat; // Snap para a coordenada exata
          train.lng = target.lng;
        } else {
          // Movimento Interpolarizado
          const moveFactor = train.speed * 0.0000025; // Constante de escala geográfica
          train.lng += (dx / distance) * moveFactor;
          train.lat += (dy / distance) * moveFactor;
        }
      }

      // Montagem do Contrato DTO (Data Transfer Object)
      const payload = {
        fleet_code: 'I', // Atualizado para a Frota I
        train_id: train.id,
        speed_kmh: parseFloat(train.speed.toFixed(2)),
        latitude: parseFloat(train.lat.toFixed(6)),
        longitude: parseFloat(train.lng.toFixed(6)),
        doors_open: train.doors,
        cbtc_sync_status: 'SYNCED',
        timestamp: new Date().toISOString()
      };

      try {
        await publisher.publish('telemetry', JSON.stringify(payload));
        process.stdout.write(`\r[CBTC] Trem ${payload.train_id} | ${payload.speed_kmh.toFixed(1).padStart(4)} km/h | Status: ${train.state.padEnd(12)} | Destino: ${target.id}`);
      } catch (error) {
        console.error(`\n[CBTC-FAIL] Trem ${payload.train_id}`, error);
      }
    }
  };

  // Loop assíncrono mantido em 1Hz (Padrão CBTC)
  setInterval(simulatePhysics, 1000);
};

runSimulator().catch(console.error);