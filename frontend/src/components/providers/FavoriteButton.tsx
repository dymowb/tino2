import React from "react";
import { IconButton, Tooltip } from "@mui/material";
import { Favorite, FavoriteBorder } from "@mui/icons-material";
import { useTranslation } from "react-i18next";

interface Props {
  saved: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

const FavoriteButton: React.FC<Props> = ({ saved, disabled, onToggle }) => {
  const { t } = useTranslation("providers");
  return (
    <Tooltip title={t(saved ? "favorites.remove" : "favorites.save")}>
      <span>
        <IconButton
          aria-label={t(saved ? "favorites.remove" : "favorites.save")}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          sx={{
            bgcolor: "background.paper",
            "&:hover": { bgcolor: "background.paper" },
          }}
        >
          {saved ? <Favorite color="error" /> : <FavoriteBorder />}
        </IconButton>
      </span>
    </Tooltip>
  );
};

export default FavoriteButton;
