'use client';

import React, { useState, useMemo } from 'react';
import { 
  PlusCircle, 
  Search, 
  MoreHorizontal, 
  Trash, 
  Loader2,
  Briefcase,
  Target,
  Banknote,
  Filter,
  CheckCircle2,
  Clock,
  Ban,
  ArrowRight
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
import { Lead, LeadStatus } from '@/lib/types';
import { saveLead, deleteLead } from '@/lib/firestore-actions';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { LeadDialog } from './lead-dialog';
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

const statusVariants: Record<LeadStatus, { color: string, icon: any }> = {
  'Unqualified': { color: 'bg-muted text-muted-foreground', icon: Ban },
  'Qualified': { color: 'bg-primary/10 text-primary', icon: Target },
  'Pitch': { color: 'bg-warning/10 text-warning', icon: Clock },
  'Negotiation': { color: 'bg-warning/20 text-warning', icon: Briefcase },
  'Contract': { color: 'bg-success/20 text-success', icon: Banknote },
  'Won': { color: 'bg-success text-success-foreground', icon: CheckCircle2 },
  'Lost': { color: 'bg-destructive/10 text-destructive', icon: Ban },
};

const formatCurrency = (val: number) => {
    const absVal = Math.abs(val);
    if (absVal >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`;
    if (absVal >= 100000) return `₹${(val / 100000).toFixed(2)}L`;
    return `₹${val.toLocaleString()}`;
};

export default function SalesTrackerPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { data: leads, loading } = useCollection<Lead>('leads');
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    return leads.filter(l => {
      const q = search.toLowerCase();
      const matchesSearch = l.companyName.toLowerCase().includes(q) || l.contactPerson.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [leads, search, statusFilter]);

  const handleSave = async (data: any) => {
    try {
      await saveLead(firestore, data, selectedLead?.id);
      toast({ title: selectedLead ? "Lead updated" : "New prospect registered" });
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Save failed", description: e.message });
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-8 animate-in fade-in duration-700">
      <PageHeader title="SALES TRACKER" description="Lead intelligence and acquisition hierarchy.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input 
              placeholder="Search prospects..." 
              className="pl-9 w-[220px] rounded-2xl glass border-none h-10 text-xs shadow-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 bg-white/40 dark:bg-white/5 rounded-2xl p-1 px-4 backdrop-blur-md shadow-inner border border-white/20 h-10">
             <Filter className="h-3 w-3 opacity-40" />
             <select 
               className="bg-transparent border-none text-[10px] font-black uppercase outline-none focus:ring-0 cursor-pointer"
               value={statusFilter}
               onChange={(e) => setStatusFilter(e.target.value)}
             >
               <option value="all">All Stages</option>
               <option value="Unqualified">Unqualified</option>
               <option value="Qualified">Qualified</option>
               <option value="Pitch">Pitch</option>
               <option value="Negotiation">Negotiation</option>
               <option value="Contract">Contract</option>
               <option value="Won">Won</option>
               <option value="Lost">Lost</option>
             </select>
          </div>

          <Button 
            size="sm" 
            className="h-10 rounded-2xl gap-2 shadow-xl shadow-primary/20 font-bold px-6"
            onClick={() => { setSelectedLead(null); setIsDialogOpen(true); }}
          >
            <PlusCircle className="h-4 w-4" />
            REGISTER LEAD
          </Button>
        </div>
      </PageHeader>

      <div className="rounded-[2.5rem] glass overflow-hidden shadow-2xl border-none">
        <Table>
          <TableHeader className="bg-foreground/[0.02]">
            <TableRow className="border-b border-foreground/5 hover:bg-transparent">
              <TableHead className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Entity & Contact</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Service Portfolio</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Lead Stage</TableHead>
              <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Estimated Value</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-32"><Loader2 className="animate-spin h-10 w-10 mx-auto text-primary/40" /></TableCell></TableRow>
            ) : filteredLeads.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-40 text-muted-foreground italic uppercase text-[10px] font-black tracking-widest opacity-40">No prospect records found in active registry.</TableCell></TableRow>
            ) : filteredLeads.map((lead) => {
              const StatusIcon = statusVariants[lead.status].icon;
              return (
                <TableRow key={lead.id} className="border-b border-foreground/5 hover:bg-foreground/[0.02] group transition-colors">
                  <TableCell className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-black text-foreground tracking-tight">{lead.companyName}</span>
                      <div className="flex items-center gap-2 opacity-60">
                        <span className="text-[9px] font-bold uppercase">{lead.contactPerson}</span>
                        <span className="h-1 w-1 rounded-full bg-foreground/20" />
                        <span className="text-[9px] font-mono">{lead.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.services.map(s => (
                        <Badge key={s} variant="outline" className="text-[8px] font-black h-4 px-1.5 leading-none border-foreground/10 bg-foreground/[0.02] uppercase">{s}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("text-[9px] font-black uppercase h-6 px-3 rounded-xl flex items-center gap-1.5 w-fit", statusVariants[lead.status].color)}>
                      <StatusIcon className="h-3 w-3" />
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-black text-xs text-primary">
                    {formatCurrency(lead.estimatedValue)}
                  </TableCell>
                  <TableCell className="px-6">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl glass border-none shadow-2xl p-2 min-w-[140px]">
                        <DropdownMenuItem className="rounded-lg text-[10px] font-black uppercase tracking-widest gap-2" onSelect={openDialogFromMenu(() => { setSelectedLead(lead); setIsDialogOpen(true); })}>
                          <ArrowRight className="h-3 w-3" /> Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem className="rounded-lg text-[10px] font-black uppercase tracking-widest text-destructive gap-2 focus:bg-destructive/10 focus:text-destructive" onSelect={openDialogFromMenu(() => setDeletingId(lead.id))}>
                          <Trash className="h-3 w-3" /> Delete Lead
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

      <LeadDialog 
        isOpen={isDialogOpen} 
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setSelectedLead(null);
        }}
        onSave={handleSave} 
        lead={selectedLead} 
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent className="rounded-[2.5rem] glass border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline text-3xl font-black uppercase tracking-tighter">Delete Lead?</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/70 font-bold uppercase text-[10px] tracking-widest leading-relaxed">
              This action will permanently purge lead details from the Aztec archive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-8">
            <AlertDialogCancel className="rounded-xl h-12 px-6 font-bold uppercase text-[10px] tracking-widest">Abort</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 rounded-xl h-12 px-8 font-black uppercase text-[10px] tracking-widest" onClick={async () => {
              if (deletingId) {
                await deleteLead(firestore, deletingId);
                toast({ title: 'Lead deleted' });
                setDeletingId(null);
              }
            }}>Confirm Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
