import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9 rounded-lg hover:bg-accent"
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5 text-yellow-500 transition-all" />
          ) : (
            <Moon className="h-5 w-5 text-slate-700 transition-all" />
          )}
          <span className="sr-only">تبديل الوضع</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}</p>
      </TooltipContent>
    </Tooltip>
  );
}
