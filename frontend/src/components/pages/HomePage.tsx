import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Container, Typography, Button, Box, useTheme } from '@mui/material';
import {
  CleaningServices, Plumbing, ElectricalServices,
  Carpenter, LocalFlorist, Build, ArrowForward,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { tokens } from '../../theme/theme';

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

// `slug` flows to /providers?service=<slug> → the AI assistant uses it to show a
// service-specific example prompt (welcome.examples.<slug>).
const services = [
  { Icon: CleaningServices, nameKey: 'home.services.house_cleaning', slug: 'house_cleaning', accent: tokens.color.earth,     span: 2 },
  { Icon: Plumbing,         nameKey: 'home.services.plumbing',       slug: 'plumbing',       accent: '#2A7BB5',               span: 1 },
  { Icon: ElectricalServices, nameKey: 'home.services.electrical',   slug: 'electrical',     accent: tokens.color.gold,      span: 1 },
  { Icon: Carpenter,        nameKey: 'home.services.handyman',        slug: 'handyman',       accent: tokens.color.stone,     span: 1 },
  { Icon: LocalFlorist,     nameKey: 'home.services.gardening',       slug: 'gardening',      accent: '#5A8A3F',              span: 1 },
  { Icon: Build,            nameKey: 'home.services.repairs',         slug: 'repairs',        accent: tokens.color.terra,     span: 2 },
];

const featurePillars = [
  {
    ordinal: '01',
    headingKey: 'home.features.verified_providers',
    features: ['home.features.verified_providers', 'home.features.customer_reviews'],
    accent: tokens.color.earth,
  },
  {
    ordinal: '02',
    headingKey: 'home.features.real_time_booking',
    features: ['home.features.real_time_booking', 'home.features.gps_discovery'],
    accent: tokens.color.terra,
  },
  {
    ordinal: '03',
    headingKey: 'home.features.secure_payments',
    features: ['home.features.secure_payments', 'home.features.instant_messaging'],
    accent: tokens.color.gold,
  },
];

const STAT_LABEL_KEYS = [
  { value: '4.8', unit: '/5',  labelKey: 'home.stat_rating_label' },
  { value: '50+', unit: '',    labelKey: 'home.stat_services_label' },
  { value: '100%', unit: '',   labelKey: 'home.stat_providers_label' },
];

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box>

      {/* ── HERO ─────────────────────────────────────── */}
      <Box
        sx={{
          minHeight: { xs: 'auto', md: '88vh' },
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'background.default',
          overflow: 'hidden',
          position: 'relative',
          py: { xs: 10, md: 0 },
        }}
      >
        {/* Dot-grid texture */}
        <Box sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(${isDark ? 'rgba(255,255,255,0.025)' : 'rgba(27,61,47,0.04)'} 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 6, md: 8 },
            flexDirection: { xs: 'column-reverse', md: 'row' },
          }}>

            {/* Left — editorial text */}
            <Box sx={{ flex: '0 0 55%' }}>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
                <Typography sx={{
                  fontFamily: tokens.font.body,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: tokens.color.terra,
                  mb: 3,
                }}>
                  {t('home.hero_eyebrow')}
                </Typography>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.08, ease }}>
                <Typography
                  variant="h1"
                  sx={{
                    fontFamily: tokens.font.display,
                    fontSize: { xs: '2.75rem', sm: '3.5rem', md: '4.25rem', lg: '5rem' },
                    fontWeight: 600,
                    lineHeight: 1.06,
                    letterSpacing: '-0.02em',
                    color: 'text.primary',
                    mb: 3,
                  }}
                >
                  {t('home.hero_headline')}
                </Typography>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.18, ease }}>
                <Typography variant="body1" sx={{
                  fontSize: '1.1rem',
                  color: 'text.secondary',
                  mb: 5,
                  maxWidth: 420,
                  lineHeight: 1.7,
                }}>
                  {t('home.subtitle')}
                </Typography>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.26, ease }}>
                {isAuthenticated && user ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                      {t('home.welcome_back', { firstName: user.firstName })}
                    </Typography>
                    <Button
                      variant="contained"
                      color="secondary"
                      size="large"
                      endIcon={<ArrowForward />}
                      onClick={() => navigate(user.userType === 'customer' ? '/providers' : '/dashboard')}
                    >
                      {user.userType === 'customer' ? t('home.find_providers') : t('home.go_to_dashboard')}
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Button variant="contained" color="secondary" size="large" endIcon={<ArrowForward />} onClick={() => navigate('/register')}>
                      {t('home.get_started')}
                    </Button>
                    <Button variant="outlined" color="primary" size="large" onClick={() => navigate('/login')}>
                      {t('home.sign_in')}
                    </Button>
                  </Box>
                )}
              </motion.div>
            </Box>

            {/* Right — geometric composition */}
            <Box sx={{
              flex: '0 0 45%',
              position: 'relative',
              height: { xs: 260, md: 460 },
              width: '100%',
            }}>
              {/* Large ring */}
              <Box sx={{
                position: 'absolute',
                width: { xs: 200, md: 320 },
                height: { xs: 200, md: 320 },
                borderRadius: '50%',
                border: `2px solid ${tokens.color.earth}`,
                opacity: isDark ? 0.18 : 0.12,
                top: '50%', left: '50%',
                transform: 'translate(-40%, -50%)',
              }} />

              {/* Terra filled circle */}
              <Box
                component={motion.div}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.12, ease }}
                sx={{
                  position: 'absolute',
                  width: { xs: 120, md: 188 },
                  height: { xs: 120, md: 188 },
                  borderRadius: '50%',
                  bgcolor: tokens.color.terra,
                  opacity: isDark ? 0.65 : 0.82,
                  top: '8%', right: '10%',
                }}
              />

              {/* Earth green rotated square */}
              <Box
                component={motion.div}
                initial={{ rotate: 20, opacity: 0 }}
                animate={{ rotate: 45, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.22, ease }}
                sx={{
                  position: 'absolute',
                  width: { xs: 80, md: 118 },
                  height: { xs: 80, md: 118 },
                  borderRadius: tokens.radius.md,
                  bgcolor: tokens.color.earth,
                  opacity: isDark ? 0.45 : 0.72,
                  bottom: '14%', left: '18%',
                }}
              />

              {/* Gold dot */}
              <Box
                component={motion.div}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.36, ease }}
                sx={{
                  position: 'absolute',
                  width: 26, height: 26,
                  borderRadius: '50%',
                  bgcolor: tokens.color.gold,
                  bottom: '28%', right: '14%',
                }}
              />

              {/* Small earth outline ring */}
              <Box sx={{
                position: 'absolute',
                width: { xs: 44, md: 64 },
                height: { xs: 44, md: 64 },
                borderRadius: '50%',
                border: `1.5px solid ${tokens.color.earthLight}`,
                opacity: 0.45,
                top: '18%', left: '8%',
              }} />

              {/* Horizontal gold line */}
              <Box sx={{
                position: 'absolute',
                width: { xs: 48, md: 80 },
                height: 2,
                bgcolor: tokens.color.gold,
                opacity: 0.55,
                bottom: '40%', right: '4%',
              }} />

              {/* Vertical accent line */}
              <Box sx={{
                position: 'absolute',
                width: 2,
                height: { xs: 40, md: 60 },
                bgcolor: tokens.color.terra,
                opacity: 0.3,
                top: '12%', left: '42%',
              }} />
            </Box>

          </Box>
        </Container>
      </Box>

      {/* ── SERVICES ─────────────────────────────────── */}
      <Box sx={{ bgcolor: 'background.paper', py: { xs: 8, md: 12 } }}>
        <Container maxWidth="lg">
          <Box sx={{ mb: 7 }}>
            <Typography sx={{
              fontFamily: tokens.font.body,
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: tokens.color.terra,
              mb: 1.5,
            }}>
              {t('home.popular_services')}
            </Typography>
            <Typography variant="h2" sx={{ fontFamily: tokens.font.display, fontWeight: 500 }}>
              {t('home.popular_services')}
            </Typography>
          </Box>

          {/* Bento grid — 4 cols on md, 2 on sm, 1 on xs */}
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 2,
          }}>
            {services.map((svc, i) => {
              const ordinal = String(i + 1).padStart(2, '0');
              const isWide = svc.span === 2;
              return (
                <Box
                  key={svc.nameKey}
                  component={motion.div}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: i * 0.07, ease }}
                  onClick={() => navigate(`/providers?service=${svc.slug}`)}
                  sx={{
                    gridColumn: { xs: '1', sm: isWide ? 'span 2' : 'span 1', md: isWide ? 'span 2' : 'span 1' },
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: tokens.radius.lg,
                    bgcolor: 'background.default',
                    border: '1px solid',
                    borderColor: 'divider',
                    p: { xs: 3, md: isWide ? 4 : 3 },
                    minHeight: { xs: 130, md: isWide ? 188 : 165 },
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    '&:hover': {
                      borderColor: svc.accent,
                      transform: 'translateY(-3px)',
                      boxShadow: `0 12px 32px ${svc.accent}22`,
                    },
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0, left: 0,
                      width: 4, height: '100%',
                      bgcolor: svc.accent,
                      borderRadius: '4px 0 0 4px',
                    },
                  }}
                >
                  {/* Ordinal watermark */}
                  <Typography sx={{
                    position: 'absolute',
                    top: -8, right: 10,
                    fontFamily: tokens.font.display,
                    fontSize: { xs: '4rem', md: isWide ? '6.5rem' : '5rem' },
                    fontWeight: 700,
                    color: svc.accent,
                    opacity: 0.07,
                    lineHeight: 1,
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}>
                    {ordinal}
                  </Typography>

                  {/* Icon */}
                  <Box sx={{ color: svc.accent }}>
                    <svc.Icon sx={{ fontSize: isWide ? 28 : 22 }} />
                  </Box>

                  {/* Name */}
                  <Typography
                    variant={isWide ? 'h4' : 'h5'}
                    sx={{ fontFamily: tokens.font.display, fontWeight: 500, color: 'text.primary', mt: 'auto', pt: 2 }}
                  >
                    {t(svc.nameKey)}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Container>
      </Box>

      {/* ── FEATURES ─────────────────────────────────── */}
      <Box sx={{ bgcolor: 'background.default', py: { xs: 8, md: 12 } }}>
        <Container maxWidth="lg">
          <Box sx={{ mb: 8, maxWidth: 520 }}>
            <Typography sx={{
              fontFamily: tokens.font.body,
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: tokens.color.terra,
              mb: 1.5,
            }}>
              {t('home.why_choose')}
            </Typography>
            <Typography variant="h2" sx={{ fontFamily: tokens.font.display, fontWeight: 500 }}>
              {t('home.why_choose')}
            </Typography>
          </Box>

          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: 3,
          }}>
            {featurePillars.map((pillar, i) => (
              <Box
                key={pillar.ordinal}
                component={motion.div}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1, ease }}
                sx={{
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: tokens.radius.lg,
                  border: '1px solid',
                  borderColor: 'divider',
                  p: { xs: 3, md: 4 },
                  minHeight: 280,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  bgcolor: 'background.paper',
                }}
              >
                {/* Large ordinal */}
                <Typography sx={{
                  fontFamily: tokens.font.display,
                  fontSize: '5rem',
                  fontWeight: 700,
                  color: pillar.accent,
                  opacity: 0.1,
                  lineHeight: 1,
                  position: 'absolute',
                  top: 12, right: 16,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}>
                  {pillar.ordinal}
                </Typography>

                {/* Accent dot */}
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: pillar.accent }} />

                {/* Heading */}
                <Typography variant="h4" sx={{
                  fontFamily: tokens.font.display,
                  fontWeight: 500,
                  color: 'text.primary',
                  maxWidth: '82%',
                  lineHeight: 1.2,
                }}>
                  {t(pillar.headingKey)}
                </Typography>

                {/* Feature bullets */}
                <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {pillar.features.map(fk => (
                    <Box key={fk} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: pillar.accent, flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                        {t(fk)}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {/* Bottom accent bar */}
                <Box sx={{
                  position: 'absolute',
                  bottom: 0, left: 0, right: 0,
                  height: 3,
                  bgcolor: pillar.accent,
                  opacity: 0.55,
                }} />
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ── CTA ─────────────────────────────────────── */}
      <Box sx={{ bgcolor: tokens.color.earth, py: { xs: 10, md: 16 }, position: 'relative', overflow: 'hidden' }}>
        {/* Background ring decorations */}
        <Box sx={{
          position: 'absolute',
          width: 560, height: 560,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.05)',
          right: -180, top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }} />
        <Box sx={{
          position: 'absolute',
          width: 280, height: 280,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.04)',
          right: 60, top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }} />

        <Container maxWidth="lg">
          <Box sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { md: 'center' },
            gap: { xs: 6, md: 10 },
          }}>
            {/* Heading + CTA */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="h2" sx={{
                fontFamily: tokens.font.display,
                color: tokens.color.cream,
                mb: 2,
                fontSize: { xs: '2.5rem', md: '3.25rem' },
                fontWeight: 500,
              }}>
                {t('home.ready_to_start')}
              </Typography>
              <Typography sx={{
                color: 'rgba(250,248,244,0.6)',
                mb: 5,
                fontSize: '1.05rem',
                maxWidth: 400,
                lineHeight: 1.7,
              }}>
                {t('home.join_message')}
              </Typography>
              {!isAuthenticated && (
                <Button
                  variant="contained"
                  color="secondary"
                  size="large"
                  endIcon={<ArrowForward />}
                  onClick={() => navigate('/register')}
                >
                  {t('home.join_today')}
                </Button>
              )}
            </Box>

            {/* Stats */}
            <Box sx={{ display: 'flex', gap: { xs: 5, md: 7 }, flexWrap: 'wrap' }}>
              {STAT_LABEL_KEYS.map(stat => (
                <Box key={stat.labelKey} sx={{ textAlign: 'center' }}>
                  <Typography sx={{
                    fontFamily: tokens.font.display,
                    fontSize: { xs: '2.75rem', md: '3.75rem' },
                    fontWeight: 600,
                    color: tokens.color.cream,
                    lineHeight: 1,
                    display: 'inline',
                  }}>
                    {stat.value}
                  </Typography>
                  {stat.unit && (
                    <Typography component="span" sx={{
                      fontFamily: tokens.font.display,
                      fontSize: '1.5rem',
                      color: tokens.color.gold,
                    }}>
                      {stat.unit}
                    </Typography>
                  )}
                  <Typography sx={{
                    fontSize: '0.72rem',
                    color: 'rgba(250,248,244,0.45)',
                    mt: 0.75,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontWeight: 600,
                  }}>
                    {t(stat.labelKey)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Container>
      </Box>

    </Box>
  );
};

export default HomePage;
