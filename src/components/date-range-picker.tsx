'use client';

import * as React from 'react';
import { Calendar as CalendarIcon, Check } from 'lucide-react';
import { 
  addDays, 
  format, 
  subDays, 
  subWeeks, 
  subMonths, 
  subYears, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth 
} from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DateRangePickerProps {
  className?: string;
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
}

export function DateRangePicker({
  className,
  date,
  setDate,
}: DateRangePickerProps) {
  const today = new Date();

  const presets = [
    {
      label: "Last week",
      range: {
        from: startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
        to: endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
      },
    },
    {
      label: "Last week & Current week",
      range: {
        from: startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
        to: endOfWeek(today, { weekStartsOn: 1 }),
      },
    },
    {
      label: "Last month",
      range: {
        from: startOfMonth(subMonths(today, 1)),
        to: endOfMonth(subMonths(today, 1)),
      },
    },
    {
      label: "Last 30 days",
      range: { from: subDays(today, 30), to: today },
    },
    {
      label: "Last 60 days",
      range: { from: subDays(today, 60), to: today },
    },
    {
      label: "Last 90 days",
      range: { from: subDays(today, 90), to: today },
    },
    {
      label: "Last 6 months",
      range: { from: subMonths(today, 6), to: today },
    },
    {
      label: "Last 1 year",
      range: { from: subYears(today, 1), to: today },
    },
    {
      label: "Last 2 years",
      range: { from: subYears(today, 2), to: today },
    },
    {
      label: "Last 3 years",
      range: { from: subYears(today, 3), to: today },
    },
  ];

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[260px] justify-start text-left font-black text-[10px] uppercase tracking-widest rounded-2xl glass border-none h-10 shadow-lg",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5 text-primary" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Select Date Range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 rounded-[2.5rem] glass border-none shadow-2xl overflow-hidden" align="end">
          <div className="flex flex-col lg:flex-row h-auto max-h-[85vh] lg:h-[450px]">
            <div className="w-full lg:w-[180px] border-r border-foreground/5 bg-foreground/[0.02] flex flex-col">
              <div className="p-4 border-b border-foreground/5 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Quick Filters</span>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {presets.map((preset) => {
                    const isActive = 
                      date?.from?.getTime() === preset.range.from.getTime() && 
                      date?.to?.getTime() === preset.range.to.getTime();
                    
                    return (
                      <button
                        key={preset.label}
                        onClick={() => setDate(preset.range)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-between group",
                          isActive 
                            ? "bg-primary text-white" 
                            : "hover:bg-foreground/5 text-foreground/70"
                        )}
                      >
                        {preset.label}
                        {isActive && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
            <div className="p-4 overflow-auto">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from || today}
                selected={date}
                onSelect={setDate}
                numberOfMonths={2}
                captionLayout="dropdown"
                fromYear={2020}
                toYear={today.getFullYear() + 10} // Expanded to support future planning (e.g. 2026)
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
