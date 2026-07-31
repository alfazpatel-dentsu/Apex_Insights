
'use client';

import React, { useState, useMemo } from 'react';
import { 
  PlusCircle, 
  Search, 
  MoreHorizontal, 
  Trash, 
  Loader2,
  Briefcase,
  User,
  Tag,
  AlertTriangle,
  Clock,
  ArrowRight,
  Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCollection, useFirestore } from '@/firebase';
import { ActionItem, ActionStatus, ActionPriority } from '@/lib/types';
import { deleteActionItem } from '@/lib/firestore-actions';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { AddActionItemDialog } from './add-action-item-dialog';
import { cn, openDialogFromMenu } from '@/lib/utils';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';

// Map internal statuses to clear operator labels
const statusLabels: Record<ActionStatus, string> = {
  'Pending': 'Pending',
  'In Progress': 'In Progress',
  'Completed': 'Completed',
  'Blocked': 'Blocked',
};

// Priority color bars
const priorityColors: Record<ActionPriority, string> = {
  'Low': 'bg-success',
  'Medium': 'bg-primary',
  'High': 'bg-warning',
  'Critical': 'bg-destructive',
};

export default function ActionItemsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { data: actions, loading } = useCollection<ActionItem>('actionItems');
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredActions = useMemo(() => {
    if (!actions) return [];
    return actions.filter(a => {
      const q = search.toLowerCase();
      // DEFENSIVE RITUAL: String fallbacks to prevent filter crashes
      const matchesSearch = 
        (a.taskName || '').toLowerCase().includes(q) || 
        (a.assignedTo || '').toLowerCase().includes(q) ||
        (a.clientName || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      const matchesSection = sectionFilter === 'all' || a.section === sectionFilter;
      return matchesSearch && matchesStatus && matchesSection;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [actions, search, statusFilter, sectionFilter]);

  return (
    <div className="flex flex-1 flex-col gap-8 animate-in fade-in duration-700">
      <PageHeader title="ACTION ITEMS" description="Strategic WoW deliverable tracking and accountability hierarchy.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input 
              placeholder="Search tasks, owners..." 
              className="pl-9 w-[220px] rounded-none glass h-10 text-xs shadow-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 bg-white/40 dark:bg-white/5 rounded-none p-1 px-4 backdrop-blur-md shadow-inner border border-white/20 h-10">
             <Filter className="h-3 w-3 text-secondary" />
             <select 
               className="bg-transparent border-none text-[10px] font-black uppercase outline-none focus:ring-0 cursor-pointer"
               value={statusFilter}
               onChange={(e) => setStatusFilter(e.target.value)}
             >
               <option value="all">All Status</option>
               {['Pending', 'In Progress', 'Completed', 'Blocked'].map(s => <option key={s} value={s}>{statusLabels[s as ActionStatus]}</option>)}
             </select>
          </div>

          <div className="flex items-center gap-2 bg-white/40 dark:bg-white/5 rounded-none p-1 px-4 backdrop-blur-md shadow-inner border border-white/20 h-10">
             <Tag className="h-3 w-3 text-secondary" />
             <select 
               className="bg-transparent border-none text-[10px] font-black uppercase outline-none focus:ring-0 cursor-pointer"
               value={sectionFilter}
               onChange={(e) => setSectionFilter(e.target.value)}
             >
               <option value="all">All Sections</option>
               {["CLIENT ENGAGEMENT", "SALES", "OPERATIONS", "AZTEC", "HR", "MANAGEMENT"].map(s => <option key={s} value={s}>{s}</option>)}
             </select>
          </div>

          <Button 
            size="sm" 
            className="h-10 rounded-none gap-2 shadow-primary/20 font-bold px-6"
            onClick={() => { setSelectedAction(null); setIsDialogOpen(true); }}
          >
            <PlusCircle className="h-4 w-4" />
            NEW ACTION
          </Button>
        </div>
      </PageHeader>

      <div className="rounded-none glass overflow-hidden ">
        <Table>
          <TableHeader className="bg-foreground/[0.02]">
            <TableRow className="border-b border-foreground/5 hover:bg-transparent">
              <TableHead className="px-8 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Task & Domain</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Accountability</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Status & Priority</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Context / Comments</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-32"><Loader2 className="animate-spin h-10 w-10 mx-auto text-primary/40" /></TableCell></TableRow>
            ) : filteredActions.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-40 text-muted-foreground italic uppercase text-[10px] font-black tracking-widest text-secondary">No action items recorded.</TableCell></TableRow>
            ) : filteredActions.map((action) => {
              return (
                <TableRow key={action.id} className="border-b border-foreground/5 hover:bg-foreground/[0.01] group transition-colors">
                  {/* TASK & DOMAIN */}
                  <TableCell className="px-8 py-6">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-black text-foreground tracking-tight">{action.taskName}</span>
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-3 w-3 opacity-30" />
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                          {action.clientName || 'Global / Aztec'}
                        </span>
                        <Badge variant="outline" className="text-[8px] font-black h-4 px-1.5 leading-none border-foreground/10 bg-foreground/[0.02] uppercase ml-1">
                          {action.section}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>

                  {/* ACCOUNTABILITY */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/5 flex items-center justify-center text-primary/60 border border-primary/10">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-foreground/80 leading-none mb-1">{action.assignedTo}</span>
                        <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                          Target: {action.dueDate || 'No deadline'}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  {/* STATUS & PRIORITY */}
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/70">
                        <Clock className="h-3.5 w-3.5 text-secondary" />
                        {statusLabels[action.status]}
                      </div>
                      <div className={cn("h-4 w-4 rounded-sm shadow-sm", priorityColors[action.priority])} title={`Priority: ${action.priority}`} />
                    </div>
                  </TableCell>

                  {/* CONTEXT / COMMENTS */}
                  <TableCell className="max-w-[400px]">
                    <p className="text-[11px] leading-relaxed font-medium text-foreground/60 italic">
                      {action.comment || action.description || 'No details recorded.'}
                    </p>
                  </TableCell>

                  {/* ACTIONS */}
                  <TableCell className="px-6 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-secondary/70 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-none glass p-2 min-w-[160px]">
                        <DropdownMenuItem className="rounded-lg text-[10px] font-black uppercase tracking-widest gap-2" onSelect={openDialogFromMenu(() => { setSelectedAction(action); setIsDialogOpen(true); })}>
                          <ArrowRight className="h-3 w-3" /> Edit Task
                        </DropdownMenuItem>
                        <DropdownMenuItem className="rounded-lg text-[10px] font-black uppercase tracking-widest text-destructive gap-2 focus:bg-destructive/10 focus:text-destructive" onSelect={openDialogFromMenu(() => setDeletingId(action.id))}>
                          <Trash className="h-3 w-3" /> Delete Task
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AddActionItemDialog 
        isOpen={isDialogOpen} 
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setSelectedAction(null);
        }}
        action={selectedAction}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent className="rounded-none glass ">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 text-destructive mb-2">
              <AlertTriangle className="h-8 w-8" />
              <AlertDialogTitle className="font-headline text-3xl font-black uppercase tracking-tighter">Delete Action Item?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-foreground/70 font-bold uppercase text-[10px] tracking-widest leading-relaxed">
              This will permanently delete the task and its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-8">
            <AlertDialogCancel className="rounded-none h-12 px-6 font-bold uppercase text-[10px] tracking-widest">CANCEL</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 rounded-none h-12 px-8 font-black uppercase text-[10px] tracking-widest" onClick={async () => {
              if (deletingId) {
                await deleteActionItem(firestore, deletingId);
                toast({ title: 'Task deleted' });
                setDeletingId(null);
              }
            }}>CONFIRM DELETE</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
