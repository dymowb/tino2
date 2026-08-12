import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { InsertDriveFile as FileIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import apiService from '../../services/api';
import { tokens } from '../../theme/theme';

/**
 * Renders a private message attachment.
 *
 * Attachments are served by an authenticated API route rather than as static files,
 * so a plain `<img src>` or `<a href>` would arrive without an Authorization header
 * and 401. The bytes are fetched through the API client and exposed as an object URL
 * instead — which also means the browser never holds a shareable link to the file.
 */

/**
 * Resolve an attachment URL to a blob object URL, revoking it on unmount.
 *
 * Also surfaces the type and filename that came back with the file. A sent message
 * stores only the URL, and these URLs have no extension, so neither can be inferred
 * from the link itself.
 */
function useAttachment(url: string) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [resolvedType, setResolvedType] = useState<string | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let created: string | null = null;

    setObjectUrl(null);
    setResolvedType(null);
    setResolvedName(null);
    setFailed(false);

    apiService
      .fetchMessageAttachment(url)
      .then(({ blob, fileName }) => {
        if (revoked) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
        setResolvedType(blob.type || null);
        setResolvedName(fileName);
      })
      .catch(() => {
        if (!revoked) setFailed(true);
      });

    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  return { objectUrl, resolvedType, resolvedName, failed };
}

interface Props {
  url: string;
  /** Known ahead of the fetch only for not-yet-sent attachments in the composer. */
  originalName?: string;
  mimeType?: string;
  /** Compact square used for not-yet-sent attachments in the composer. */
  thumbnail?: boolean;
}

const AttachmentPreview: React.FC<Props> = ({ url, originalName, mimeType, thumbnail }) => {
  const { t } = useTranslation('messages');
  const { objectUrl, resolvedType, resolvedName, failed } = useAttachment(url);

  // Prefer what the server actually sent over anything guessed from the URL.
  const effectiveType = mimeType ?? resolvedType;
  const displayName = originalName ?? resolvedName ?? t('conversation.attachment');
  const isImage = effectiveType
    ? effectiveType.startsWith('image/')
    : /\.(jpg|jpeg|png|gif|webp)$/i.test(displayName);

  const size = thumbnail ? 60 : undefined;

  if (failed) {
    return (
      <Typography sx={{ fontSize: '0.75rem', opacity: 0.7 }}>
        {t('conversation.attachment_unavailable')}
      </Typography>
    );
  }

  if (!objectUrl) {
    return (
      <Box
        sx={{
          width: size ?? 80,
          height: size ?? 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress size={16} />
      </Box>
    );
  }

  if (isImage) {
    return (
      <Box
        component="img"
        src={objectUrl}
        alt={displayName}
        onClick={thumbnail ? undefined : () => window.open(objectUrl, '_blank', 'noopener')}
        sx={
          thumbnail
            ? { width: 60, height: 60, objectFit: 'cover', borderRadius: tokens.radius.sm }
            : {
                maxWidth: 220,
                maxHeight: 220,
                borderRadius: tokens.radius.sm,
                cursor: 'pointer',
                display: 'block',
              }
        }
      />
    );
  }

  if (thumbnail) {
    return (
      <Box
        sx={{
          width: 60,
          height: 60,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: tokens.radius.sm,
        }}
      >
        <FileIcon fontSize="small" />
        <Typography sx={{ fontSize: 8, px: 0.5, textAlign: 'center', wordBreak: 'break-all' }}>
          {displayName.length > 10 ? displayName.slice(0, 9) + '…' : displayName}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      component="a"
      href={objectUrl}
      download={displayName}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        color: 'inherit',
        textDecoration: 'none',
        '&:hover': { textDecoration: 'underline' },
      }}
    >
      <FileIcon fontSize="small" />
      <Typography sx={{ fontSize: '0.78rem' }}>{displayName}</Typography>
    </Box>
  );
};

export default AttachmentPreview;
