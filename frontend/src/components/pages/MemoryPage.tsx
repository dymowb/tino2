import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Chip,
  Switch,
  FormControlLabel,
  Alert,
  Divider,
  Tooltip,
  LinearProgress,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PsychologyIcon from '@mui/icons-material/Psychology';
import HistoryIcon from '@mui/icons-material/History';
import RuleIcon from '@mui/icons-material/Rule';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SemanticMemory {
  id: string;
  content: string;
  confidence: string | number;
  access_count: string | number;
  created_at: string;
  last_accessed_at: string | null;
}

interface EpisodicMemory {
  id: string;
  summary: string;
  importance: string | number;
  access_count: string | number;
  occurred_at: string;
  created_at: string;
}

interface ProceduralRule {
  id: string;
  rule_text: string;
  prompt_fragment: string;
  confidence: string | number;
  status: string;
  created_at: string;
}

interface MemoryData {
  semantic: SemanticMemory[];
  episodic: EpisodicMemory[];
  procedural: ProceduralRule[];
  isOptedOut: boolean;
  memoryDisabled?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const confidenceColor = (v: number): 'error' | 'warning' | 'success' =>
  v >= 0.8 ? 'success' : v >= 0.6 ? 'warning' : 'error';

// ── Delete confirmation dialog ────────────────────────────────────────────────

interface DeleteDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  label: string;
}

const DeleteDialog: React.FC<DeleteDialogProps> = ({ open, onClose, onConfirm, label }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Remover memória?</DialogTitle>
    <DialogContent>
      <DialogContentText>
        Esta ação vai apagar permanentemente:<br />
        <strong>{label}</strong>
        <br /><br />
        O assistente não terá mais acesso a esta informação em sessões futuras.
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancelar</Button>
      <Button onClick={onConfirm} color="error" variant="contained">Remover</Button>
    </DialogActions>
  </Dialog>
);

// ── Section skeleton ──────────────────────────────────────────────────────────

const SectionSkeleton = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
    {[0, 1, 2].map(i => <Skeleton key={i} variant="rounded" height={72} />)}
  </Box>
);

// ── Main page ─────────────────────────────────────────────────────────────────

const MemoryPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; label: string } | null>(null);

  const { data, isLoading, isError } = useQuery<MemoryData>({
    queryKey: ['my-memories'],
    queryFn: async () => {
      const res = await apiService.get('/memory/me');
      return res.data.data as MemoryData;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) =>
      apiService.delete(`/memory/me/${type}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-memories'] });
      toast.success('Memória removida');
    },
    onError: () => toast.error('Não foi possível remover a memória'),
  });

  const optOutMutation = useMutation({
    mutationFn: (optOut: boolean) =>
      apiService.patch('/memory/me/optout', { optOut }),
    onSuccess: (_res, optOut) => {
      queryClient.invalidateQueries({ queryKey: ['my-memories'] });
      toast.success(optOut ? 'Memória desativada' : 'Memória reativada');
    },
    onError: () => toast.error('Não foi possível alterar a configuração'),
  });

  const handleDelete = (type: string, id: string, label: string) =>
    setDeleteTarget({ type, id, label });

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ type: deleteTarget.type, id: deleteTarget.id });
      setDeleteTarget(null);
    }
  };

  if (isError) {
    return (
      <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
        <Alert severity="error">Não foi possível carregar suas memórias. Tente novamente mais tarde.</Alert>
      </Box>
    );
  }

  if (data?.memoryDisabled) {
    return (
      <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
        <Alert severity="info">
          O sistema de memória não está ativo neste ambiente.
        </Alert>
      </Box>
    );
  }

  const isOptedOut = data?.isOptedOut ?? false;

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <PsychologyIcon sx={{ fontSize: 36, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>Minha Memória</Typography>
          <Typography variant="body2" color="text.secondary">
            O que o assistente sabe sobre você e como usa essas informações
          </Typography>
        </Box>
      </Box>

      {/* Opt-out toggle */}
      <Card sx={{ mb: 3, border: '1px solid', borderColor: isOptedOut ? 'warning.main' : 'divider' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                Aprendizado personalizado
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Quando ativo, o assistente lembra de suas preferências, orçamento, localização e histórico
                para oferecer recomendações mais precisas em cada sessão.
                {isOptedOut && (
                  <Box component="span" sx={{ display: 'block', mt: 1, color: 'warning.main', fontWeight: 500 }}>
                    Memória desativada — desativar também apaga todos os dados existentes.
                  </Box>
                )}
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={!isOptedOut}
                  onChange={e => optOutMutation.mutate(!e.target.checked)}
                  disabled={optOutMutation.isPending}
                  color="primary"
                />
              }
              label=""
              sx={{ m: 0 }}
            />
          </Box>
        </CardContent>
      </Card>

      {isOptedOut ? (
        <Alert severity="warning">
          Memória desativada. Reative para ver e gerenciar suas informações.
        </Alert>
      ) : (
        <>
          {/* Procedural Rules */}
          <Section
            icon={<RuleIcon color="primary" />}
            title="Regras ativas"
            subtitle="Comportamentos que o assistente aplica automaticamente com base nos seus padrões"
            tooltip="Derivadas das suas sessões passadas. Têm prioridade sobre o comportamento padrão do assistente."
            emptyText="Nenhuma regra ativa ainda. Continue usando o assistente para que ele aprenda seus padrões."
            isLoading={isLoading}
          >
            {data?.procedural.map(rule => (
              <MemoryCard
                key={rule.id}
                primary={rule.rule_text}
                secondary={`Confiança ${(Number(rule.confidence) * 100).toFixed(0)}%`}
                confidence={Number(rule.confidence)}
                date={rule.created_at}
                onDelete={() => handleDelete('procedural', rule.id, rule.rule_text)}
              />
            ))}
          </Section>

          <Divider sx={{ my: 3 }} />

          {/* Semantic memories */}
          <Section
            icon={<PsychologyIcon color="secondary" />}
            title="O que sabemos sobre você"
            subtitle="Fatos extraídos das suas conversas — preferências, localização, orçamento"
            tooltip="Usados para pular perguntas já respondidas e personalizar recomendações."
            emptyText="Nenhum fato registrado ainda. Inicie uma sessão com o assistente para começar."
            isLoading={isLoading}
          >
            {data?.semantic.map(mem => (
              <MemoryCard
                key={mem.id}
                primary={mem.content}
                secondary={`Confiança ${(Number(mem.confidence) * 100).toFixed(0)}% · Acessado ${mem.access_count}×`}
                confidence={Number(mem.confidence)}
                date={mem.created_at}
                onDelete={() => handleDelete('semantic', mem.id, mem.content)}
              />
            ))}
          </Section>

          <Divider sx={{ my: 3 }} />

          {/* Episodic memories */}
          <Section
            icon={<HistoryIcon sx={{ color: 'text.secondary' }} />}
            title="Histórico de sessões"
            subtitle="Resumo das suas sessões passadas com o assistente"
            tooltip="Contexto recente que ajuda o assistente a entender o que você já buscou."
            emptyText="Nenhuma sessão registrada ainda."
            isLoading={isLoading}
          >
            {data?.episodic.map(ep => (
              <MemoryCard
                key={ep.id}
                primary={ep.summary}
                secondary={`Importância ${(Number(ep.importance) * 100).toFixed(0)}% · ${fmtDate(ep.occurred_at)}`}
                confidence={Number(ep.importance)}
                date={ep.occurred_at}
                onDelete={() => handleDelete('episodic', ep.id, ep.summary.slice(0, 60) + '...')}
              />
            ))}
          </Section>
        </>
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        label={deleteTarget?.label ?? ''}
      />
    </Box>
  );
};

// ── Section wrapper ───────────────────────────────────────────────────────────

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tooltip: string;
  emptyText: string;
  isLoading: boolean;
  children?: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ icon, title, subtitle, tooltip, emptyText, isLoading, children }) => {
  const items = React.Children.toArray(children);
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        {icon}
        <Typography variant="h6" fontWeight={600}>{title}</Typography>
        <Tooltip title={tooltip} placement="top">
          <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled', cursor: 'help' }} />
        </Tooltip>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {subtitle}
      </Typography>
      {isLoading ? (
        <SectionSkeleton />
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.disabled" fontStyle="italic">{emptyText}</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {children}
        </Box>
      )}
    </Box>
  );
};

// ── Single memory card ────────────────────────────────────────────────────────

interface MemoryCardProps {
  primary: string;
  secondary: string;
  confidence: number;
  date: string;
  onDelete: () => void;
}

const MemoryCard: React.FC<MemoryCardProps> = ({ primary, secondary, confidence, date, onDelete }) => (
  <Card variant="outlined" sx={{ '&:hover': { boxShadow: 2 }, transition: 'box-shadow 0.2s' }}>
    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{primary}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
            <Chip
              label={secondary}
              size="small"
              color={confidenceColor(confidence)}
              variant="outlined"
              sx={{ height: 20, fontSize: 11 }}
            />
            <Typography variant="caption" color="text.disabled">{fmtDate(date)}</Typography>
            <Box sx={{ flex: 1, minWidth: 60, maxWidth: 120 }}>
              <LinearProgress
                variant="determinate"
                value={confidence * 100}
                color={confidenceColor(confidence)}
                sx={{ height: 4, borderRadius: 2 }}
              />
            </Box>
          </Box>
        </Box>
        <Tooltip title="Remover esta memória">
          <IconButton size="small" onClick={onDelete} color="error" sx={{ mt: -0.5 }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </CardContent>
  </Card>
);

export default MemoryPage;
