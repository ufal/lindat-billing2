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
use Digest::MD5;



my $outdir = '.';
my (@logfiles,$dbuser,$dbhost,$dbdatabase,$dbpassword);
my $dbport = 5432;
my $ignore = qr/\.(gif|jpg|jpeg|tiff|png|js|css|eot|ico|svg)$/;
my @services;
my @print_sql;

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

my $file_id = 1;

my $sql='
SELECT MAX(file_id) AS file_id
FROM log_files;
';

my $sth = $dbi->prepare($sql);
$sth->execute;
if(my $result = $sth->fetchrow_hashref){
  $file_id = $result->{file_id} + 1;
}

$sql='
SELECT service_id, prefix
FROM services
ORDER BY service_id;
';


$sth = $dbi->prepare($sql);
$sth->execute;
while(my $result = $sth->fetchrow_hashref){
  push @services, {id => $result->{service_id}, reg => $result->{prefix}}
}

for my $log_file_path (@logfiles) {
  my $log_file = basename($log_file_path);
  my $sql="SELECT 1 FROM log_files WHERE file_name='$log_file';";
  my $sth = $dbi->prepare($sql);
  $sth->execute;
  if(my $result = $sth->fetchrow_hashref){
    print STDERR "ERROR: skipping $log_file - file exists in database\n";
    next;
  }
  $file_id++;
  push @print_sql,"DO \$\$ BEGIN RAISE NOTICE 'LOG FILE ($log_file) ID=$file_id'; END; \$\$; \n";

  my ($file_name) = $log_file =~ m/^(.*)\./;
  my $sql_file = "$file_name.sql";
###  my $dump_file = "$file_name.dump";
  my ($first_line_checksum, $last_read_line_checksum, $lines_read, $lines_valid) = (undef, undef, 0, 0);
  open LOG, "<$log_file_path" or die "Could not open $log_file_path: $!";
  my $prev_date='';
  while(my $line = <LOG>){
    $lines_read++;
    $line =~ s/\n$//;
    my $escapedline = $line;
    $escapedline =~ s/\\/\\\\/g;
    my ($remote_addr, $remote_user, $time_local, $method, $request, $protocol, $status, $body_bytes_sent,$http_referer, $http_user_agent, $unit) =
        $escapedline =~ /^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+) - ([^\s]+) \[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} \+\d{4})\] +"([A-Z]+) ([^" ]*) ([^" ]*)" (2\d\d) ([-\d]*) "([^"]*)" "([^"]*)" [^\s]* [^\s]* [^\s](?: .*billing:infclen=(\d+))?/;
    $unit //=0;
    if($status && $request !~ /$ignore/){
      $last_read_line_checksum = Digest::MD5::md5_hex($line);
      $first_line_checksum //= $last_read_line_checksum;
      my $service_id;
      for my $service (@services){
        if($request =~ $service->{reg}){
          $service_id = $service->{id};
          last if $service_id > 0;
        }
      }
      next unless defined $service_id;
      my ($act_date) = join('-',split('/',substr($time_local,0,11)));
      unless($act_date eq $prev_date){

        unless($lines_valid){
          close DUMP;
        }
        my $dump_file = "$file_name.$act_date.dump";
        push @print_sql,"
DO
\$\$
BEGIN
  RAISE NOTICE '\%', NOW();
  RAISE NOTICE 'starting importing from $dump_file';
  RAISE NOTICE 'log file line: $lines_read';
END;
\$\$;
";
        push @print_sql,"\\copy log_file_entries(file_id, service_id, line_number, line_checksum, remote_addr, remote_user, time_local, method, request, protocol, status, body_bytes_sent, http_referer, http_user_agent, unit) from '$dump_file'";
        open DUMP, ">".File::Spec->catfile($outdir,$dump_file) or die "Could not open $dump_file: $!";
        $prev_date = $act_date;
      }

      $lines_valid++;
##      print STDERR "$service_id: $request\n";
      print DUMP join("\t", ($file_id,$service_id,$lines_valid,$last_read_line_checksum,$remote_addr,$remote_user,$time_local, $method, $request, $protocol, $status, $body_bytes_sent,$http_referer, $http_user_agent, $unit)),"\n";
    }
  }
  close DUMP;
  close LOG;

  open SQL, ">".File::Spec->catfile($outdir,$sql_file) or die "Could not open $sql_file: $!";
  print SQL " -- $log_file sql dump
ALTER TABLE log_file_entries DISABLE TRIGGER log_files_lines_read;
ALTER TABLE log_file_entries DISABLE TRIGGER log_files_lines_read_aggr;


INSERT
INTO log_files(file_id, file_name, first_line_checksum, last_read_line_checksum, lines_read, lines_valid, tail)
VALUES($file_id,'$log_file','$first_line_checksum', '$last_read_line_checksum', $lines_read, $lines_valid,FALSE);
";
  print SQL "$_\n" for @print_sql;

  print SQL "
ALTER TABLE log_file_entries ENABLE TRIGGER log_files_lines_read;
ALTER TABLE log_file_entries ENABLE TRIGGER log_files_lines_read_aggr;
";
  print SQL "DO \$\$ BEGIN RAISE NOTICE 'TODO: run aggregations for:::  SELECT * FROM log_files_entries WHERE file_id=$file_id'; END; \$\$; \n";
  close SQL;
}

$dbi->disconnect();