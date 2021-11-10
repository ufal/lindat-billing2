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
  my ($file_name) = $log_file =~ m/^(.*)\./;
  my $sql_file = "$file_name.sql";
  my $dump_file = "$file_name.dump";
  my ($first_line_checksum, $last_read_line_checksum, $lines_read, $lines_valid) = (undef, undef, 0, 0);
  open LOG, "<$log_file_path" or die "Could not open $log_file_path: $!";
  open DUMP, ">".File::Spec->catfile($outdir,$dump_file) or die "Could not open $dump_file: $!";
  while(my $line = <LOG>){
    $lines_read++;
    $line =~ s/\n$//;
    my ($remote_addr, $remote_user, $time_local, $method, $request, $protocol, $status, $body_bytes_sent,$http_referer, $http_user_agent, $unit) =
        $line =~ /^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+) - ([^\s]+) \[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} \+\d{4})\] +"([A-Z]+) ([^" ]*) ([^" ]*)" (2\d\d) ([-\d]*) "([^"]*)" "([^"]*)" [^\s]* [^\s]* [^\s](?: .*billing:infclen=(\d+))?/;
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
      $lines_valid++;
##      print STDERR "$service_id: $request\n";
      print DUMP join("\t", ($file_id,$service_id,$lines_valid,$last_read_line_checksum,$remote_addr,$remote_user,$time_local, $method, $request, $protocol, $status, $body_bytes_sent,$http_referer, $http_user_agent, $unit)),"\n";
    }
  }
  close DUMP;
  close LOG;

  open FILE, ">".File::Spec->catfile($outdir,$sql_file) or die "Could not open $sql_file: $!";
  print FILE " -- $log_file sql dump
INSERT
INTO log_files(file_id, file_name, first_line_checksum, last_read_line_checksum, lines_read, lines_valid, tail)
VALUES($file_id,'$log_file','$first_line_checksum', '$last_read_line_checksum', $lines_read, $lines_valid,FALSE);

\\copy log_file_entries(file_id, service_id, line_number, line_checksum, remote_addr, remote_user, time_local, method, request, protocol, status, body_bytes_sent, http_referer, http_user_agent, unit) from '$dump_file'
";
  close FILE;
}

$dbi->disconnect();