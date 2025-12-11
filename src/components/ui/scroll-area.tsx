"use client";

import * as React from "react";
import { Box, BoxProps } from "@mui/material";
import { cn } from "./utils";

interface ScrollAreaProps extends BoxProps {
  orientation?: "vertical" | "horizontal" | "both";
}

function ScrollArea({
  className,
  children,
  orientation = "vertical",
  sx,
  ...props
}: ScrollAreaProps) {
  const scrollbarStyles = React.useMemo(() => {
    const baseStyles = {
      '&::-webkit-scrollbar': {
        width: '10px',
        height: '10px',
      },
      '&::-webkit-scrollbar-track': {
        background: 'transparent',
      },
      '&::-webkit-scrollbar-thumb': {
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '5px',
        '&:hover': {
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
        },
      },
    };

    if (orientation === 'vertical') {
      return {
        ...baseStyles,
        overflowY: 'auto',
        overflowX: 'hidden',
      };
    } else if (orientation === 'horizontal') {
      return {
        ...baseStyles,
        overflowX: 'auto',
        overflowY: 'hidden',
      };
    } else {
      return {
        ...baseStyles,
        overflow: 'auto',
      };
    }
  }, [orientation]);

  return (
    <Box
      data-slot="scroll-area"
      className={cn("relative", className)}
      sx={{
        ...scrollbarStyles,
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: BoxProps & { orientation?: "vertical" | "horizontal" }) {
  // MUI Box 已經內建滾動條樣式，此組件保留以維持 API 兼容性
  return null;
}

export { ScrollArea, ScrollBar };
