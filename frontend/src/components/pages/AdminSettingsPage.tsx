import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Button, CircularProgress, Alert, Chip,
} from '@mui/material';
import { Save } from '@mui/icons-material';
import apiService from '../../services/api';

interface Setting {
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

const AdminSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiService.get('/admin/settings')
      .then(res => {
        setSettings(res.data.data);
        const initial: Record<string, string> = {};
        res.data.data.forEach((s: Setting) => { initial[s.key] = s.value; });
        setEdits(initial);
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (key: string) => {
    setSaving(p => ({ ...p, [key]: true }));
    try {
      await apiService.put(`/admin/settings/${key}`, { value: edits[key] });
      setSaved(p => ({ ...p, [key]: true }));
      setTimeout(() => setSaved(p => ({ ...p, [key]: false })), 2000);
      setSettings(p => p.map(s => s.key === key ? { ...s, value: edits[key] } : s));
    } catch {
      setError(`Failed to save ${key}`);
    } finally {
      setSaving(p => ({ ...p, [key]: false }));
    }
  };

  if (loading) return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3, maxWidth: 800 }}>
      <Typography variant="h5" fontWeight="bold" gutterBottom>Platform Settings</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        These settings control platform behaviour. Changes take effect immediately.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><b>Setting</b></TableCell>
              <TableCell><b>Description</b></TableCell>
              <TableCell width={160}><b>Value</b></TableCell>
              <TableCell width={100}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {settings.map(s => (
              <TableRow key={s.key}>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">{s.key}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">{s.description || '—'}</Typography>
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    value={edits[s.key] ?? s.value}
                    onChange={e => setEdits(p => ({ ...p, [s.key]: e.target.value }))}
                    sx={{ width: 120 }}
                  />
                </TableCell>
                <TableCell>
                  {saved[s.key]
                    ? <Chip label="Saved" color="success" size="small" />
                    : (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={saving[s.key] ? <CircularProgress size={14} /> : <Save />}
                        onClick={() => handleSave(s.key)}
                        disabled={saving[s.key] || edits[s.key] === s.value}
                      >
                        Save
                      </Button>
                    )
                  }
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

export default AdminSettingsPage;
