import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
  Language as LanguageIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { LOCALES } from '../../i18n/manifest';

// The menu is built from the manifest rather than its own list, so a locale can
// never be offered here without the translation files to back it — which is how
// Spanish came to be selectable while a third of its strings did not exist.
const languages = LOCALES;

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation('common');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    handleClose();
  };

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  return (
    <>
      <Tooltip title={t('change_language')}>
        <IconButton
          onClick={handleClick}
          size="small"
          sx={{ ml: 1 }}
          aria-controls={open ? 'language-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          <LanguageIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        id="language-menu"
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {languages.map((language) => (
          <MenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            selected={language.code === i18n.language}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              {language.code === i18n.language && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>
              {language.flag} {language.name}
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default LanguageSwitcher;
