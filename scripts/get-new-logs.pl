#!/usr/bin/perl

use warnings;
use strict;
use open qw(:std :utf8);
use utf8;
use Getopt::Long;
use DBI;
use File::Path;
use File::Spec;
use File::Basename;
use DateTime::Format::Strptime;


my $strp = DateTime::Format::Strptime->new(
  pattern => '%d/%b/%Y:%H:%M:%S %z',
  on_error => 'croak',
);

my $strp2 = DateTime::Format::Strptime->new(
  pattern => '%Y-%m-%e %H:%M:%S',
  on_error => 'croak',
);

my $today = DateTime->today->ymd;
my $outdir = '.';
my (@logfiles,$dbuser,$dbhost,$dbdatabase,$dbpassword);
my $dbport = 5432;

my $first_day_to_import;

GetOptions (
            'in-files=s{1,}' => \@logfiles,
            'out-dir=s' => \$outdir,
            'db-user=s' => \$dbuser,
            'db-host=s' => \$dbhost,
            'db-database=s' => \$dbdatabase,
            'db-password=s' => \$dbpassword,
            'db-port=i' => \$dbport,
        );


my $dbi = DBI->connect("dbi:Pg:host=$dbhost;database=$dbdatabase;port=$dbport", $dbuser, $dbpassword, { RaiseError => 1, AutoCommit => 0, ReadOnly => 1 });

unless($dbi){
  die "Unable to connect to database\n";
}

File::Path::mkpath($outdir) unless -d $outdir;



my $sql='
SELECT max(period_end_date) AS first
FROM log_ip_aggr
WHERE period_level=\'day\';
';

my $sth = $dbi->prepare($sql);
$sth->execute;
if(my $result = $sth->fetchrow_hashref){
  $first_day_to_import = $strp2->parse_datetime($result->{first});
  $sth->finish();
}

print STDERR "First day to import: $first_day_to_import\n";

my %logfile_daterange = map {$_ => get_range($_) } @logfiles;
my @logfiles_sorted = sort {$logfile_daterange{$a}->{from} <=> $logfile_daterange{$b}->{from}} @logfiles;


my $last_date = '';
for my $log_file_in (@logfiles_sorted) {
  open IN, "<$log_file_in" or die "Could not open $log_file_in: $!";
  while(my $line = <IN>){
    my $date = get_datetime($line);
    next unless $date;
    next if $date < $first_day_to_import;
    if($date->ymd lt $today){
      if(!$last_date || $last_date lt $date->ymd){
    	  close OUT unless $last_date;
    	  $last_date = $date->ymd;
    	  open OUT, ">$outdir/$last_date.log" or die "Could not open $outdir/$last_date.log: $!";
      }
      print OUT $line;
      } else {
      	last;
      }
  }
  close IN;
}
close OUT if $last_date;


$dbi->disconnect();


sub get_range {
  my $fname = shift;
  my $range = {};
  my ($from,$to);
  my $line;
  open FH, "<$fname" or die "Could not open $fname: $!";
  while(!$from and $line = <FH>){
    $from = get_datetime($line);
  };
  $range->{from} = $from;
=not
  $to = $from;
  my $last;
  while($line = <FH>){
    $last = $line;
  };
  $to = get_datetime($line);
  $range->{to} = $to;
=cut
  close FH;
  return $range
}

sub get_datetime {
	my $line = shift;
	$line =~ s/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+ - [^\s]+ \[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} \+\d{4})\].*$/$1/;
  my $datetime = $strp->parse_datetime($line);
  return $datetime;
}