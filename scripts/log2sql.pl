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
use DateTime::Format::Strptime;



my $outdir = '.';
my (@logfiles,$dbuser,$dbhost,$dbdatabase,$dbpassword);
my $dbport = 5432;
my $ignore = qr/\.(gif|jpg|jpeg|tiff|png|js|css|eot|ico|svg)$/;
my @services;

my $strp = DateTime::Format::Strptime->new(
  pattern => '%d/%b/%Y:%H:%M:%S %z',
  on_error => 'croak',
);

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
  my @print_sql;
  my $log_file = basename($log_file_path);
  my $sql="SELECT 1 FROM log_files WHERE file_name='$log_file';";
  my $sth = $dbi->prepare($sql);
  $sth->execute;
  if(my $result = $sth->fetchrow_hashref){
    print STDERR "ERROR: skipping $log_file - file exists in database\n";
    next;
  }
  $file_id++;
  push @print_sql,'\cd :workingdir';

  push @print_sql,"DO \$\$ BEGIN RAISE NOTICE 'LOG FILE ($log_file) ID=$file_id'; END; \$\$; \n";

  my ($file_name) = $log_file =~ m/^(.*)\./;
  my $sql_file = "$file_name.sql";
  my ($first_line_checksum, $last_read_line_checksum, $lines_read, $lines_valid) = (undef, undef, 0, 0);
  open LOG, "<$log_file_path" or die "Could not open $log_file_path: $!";
  my $prev_date='';
  my $prev_time='';
  my $aggr_data = {};
  $aggr_data->{month}={};
  my $first_datetime;
  my $last_datetime;
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
      my $act_date = $time_local;
      $act_date =~ s/\d{2}:\d{2}:\d{2} \+/00:00:00 \+/;
      my $act_time = $time_local;
      $act_time =~ s/:\d{2}:\d{2} \+/:00:00 \+/;

      unless($act_date eq $prev_date){
        unless($lines_valid){
          close DUMP_AGGR;
        }
        print_aggregated_data(\*DUMP_AGGR, $aggr_data,$prev_date,'day');
        $aggr_data->{day}={};
        my $date_filename = join('-',split('/',substr($act_date,0,11)));
        my $dump_aggr_file = "$file_name.ip_aggr.dump";

        push @print_sql,"DO \$\$ BEGIN RAISE NOTICE 'IMPORTING HOUR AND DAY AGGR--------------[\%]----------------', NOW();END;\$\$;";
        push @print_sql,"\\copy log_ip_aggr(period_start_date, period_end_date, period_level, ip, service_id, cnt_requests, cnt_units, cnt_body_bytes_sent) from '$dump_aggr_file'";
        open DUMP_AGGR, ">".File::Spec->catfile($outdir,$dump_aggr_file) or die "Could not open $dump_aggr_file: $!";

        $prev_date = $act_date;
        $first_datetime = $time_local unless $first_datetime;
        $last_datetime = $time_local;
      }
      unless($act_time eq $prev_time){
        print_aggregated_data(\*DUMP_AGGR, $aggr_data, $prev_time,'hour');
        $aggr_data->{hour}={};
        $prev_time = $act_time;
      }


      $lines_valid++;
      for my $ip ($remote_addr, '\N') {
        for my $service ($service_id, '\N'){
          aggregate_data($aggr_data, $ip, $service, 1, $unit, $body_bytes_sent);
        }
      }
    }
  }

  print_aggregated_data(\*DUMP_AGGR, $aggr_data,$prev_time,'hour');
  print_aggregated_data(\*DUMP_AGGR, $aggr_data,$prev_date,'day');
  close DUMP_AGGR;
  close LOG;


  my $act_month = $prev_date; $act_month =~ s/^../01/;
  my $month_aggr_sql = add_aggregate_data_string($aggr_data,$act_month,'month');
  push @print_sql,"$month_aggr_sql";

  # generating endpoints data
  push @print_sql," -- aggregating endpoints data
-- hour + day aggregations
INSERT INTO log_aggr
(
        period_start_date,
        period_end_date,
        period_level,
        endpoint_id,
        service_id,
        cnt_requests,
        cnt_units,
        cnt_body_bytes_sent
)
SELECT li.period_start_date,li.period_end_date,li.period_level,ue.endpoint_id,li.service_id,li.cnt_requests,li.cnt_units,li.cnt_body_bytes_sent
FROM
  log_ip_aggr li
  JOIN
  user_endpoints ue
  ON li.ip = ue.ip
WHERE
  li.period_start_date >= '$first_datetime'
  AND ue.start_date >= li.period_start_date
  AND (li.period_level = 'hour' OR li.period_level = 'day')
  AND ue.is_active = TRUE;

-- remove month aggregations
DELETE FROM log_aggr
WHERE
  period_level = 'month'
  AND period_end_date > '$first_datetime';

-- insert new month aggregations


INSERT INTO log_aggr
(
        period_start_date,
        period_end_date,
        period_level,
        endpoint_id,
        service_id,
        cnt_requests,
        cnt_units,
        cnt_body_bytes_sent
)
SELECT
  li.period_start_date,
  li.period_end_date,
  li.period_level,
  la.endpoint_id,
  la.service_id,
  sum(la.cnt_requests),
  sum(la.cnt_units),
  sum(la.cnt_body_bytes_sent)
FROM
  log_ip_aggr li
  JOIN
  user_endpoints ue
  ON
    li.ip = ue.ip
  JOIN
  log_aggr la
  ON
    ue.endpoint_id = la.endpoint_id
    AND li.service_id = la.service_id
    AND la.period_start_date >= li.period_start_date
    AND la.period_end_date <= li.period_end_date
WHERE
  la.period_start_date >= '$first_datetime'
  AND li.period_level = 'month'
  AND la.period_level = 'day'
GROUP BY
  li.period_start_date,
  li.period_end_date,
  li.period_level,
  la.endpoint_id,
  la.service_id;
";


  # writting sql commands
  open SQL, ">".File::Spec->catfile($outdir,$sql_file) or die "Could not open $sql_file: $!";
  print SQL " -- $log_file sql dump
DO \$\$ BEGIN RAISE NOTICE 'STARTED--------------[\%]----------------', NOW(); END; \$\$;
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
DO \$\$ BEGIN RAISE NOTICE 'FINISHED--------------[\%]----------------', NOW(); END; \$\$;

";

  print STDERR "imported period: $first_datetime  --  $last_datetime\n";

  close SQL;

  $first_datetime =~ s/:\d{2}:\d{2} \+/:00:00 \+/;
  $last_datetime =~ s/:\d{2}:\d{2} \+/:00:00 \+/;
  $last_datetime = $strp->parse_datetime($last_datetime)->add(hours => 1)->strftime('%d/%b/%Y:%H:%M:%S %z');
  print STDERR "aggregated period: $first_datetime  --  $last_datetime\n";

  for my $bound (['lower', $first_datetime],['upper',$last_datetime]){
    print STDERR "TESTING ",$bound->[0],": ",$bound->[1],"\n";
    my $dt = $bound->[1];
    for my $level (qw/hour day month/){
      $sql="
SELECT count(1) AS cnt
FROM log_ip_aggr
WHERE
  period_start_date <= '$dt'
  AND period_end_date > '$dt'
  AND period_level = '$level'::period_levels;
";
      $sth = $dbi->prepare($sql);
      $sth->execute;
      if(my $result = $sth->fetchrow_hashref){
        print STDERR "  WARNING: ",$result->{cnt}," records cross boundary on $level level in existing database !!! \n\t-> IT PRODUCES DUPLICITIES WHEN IMPORT THIS\n" if $result->{cnt};
      }
    }
  }
}


$dbi->disconnect();


sub print_aggregated_data{
  my ($fh,$aggr_data, $start_time, $period) = @_;
  return unless $start_time;
  my $end_time = $strp->parse_datetime($start_time);
  $end_time->add("${period}s" => 1);
  $end_time = $end_time->strftime('%d/%b/%Y:%H:%M:%S %z');
  for my $ip (keys %{$aggr_data->{$period}}) {
    for my $service (keys %{$aggr_data->{$period}->{$ip}}){
      print $fh join("\t",$start_time, $end_time, $period,$ip,$service,@{$aggr_data->{$period}->{$ip}->{$service}}),"\n";
    }
  }
}

sub aggregate_data{
  my ($data, $ip, $service, $request, $unit, $body_bytes_sent) = @_;
  for my $period (qw/hour day month/){
    $data->{$period}->{$ip} //={};
    $data->{$period}->{$ip}->{$service} //= [0, 0, 0];
    $data->{$period}->{$ip}->{$service}->[0] += 1; ## requests
    $data->{$period}->{$ip}->{$service}->[1] += $unit; ## units
    $data->{$period}->{$ip}->{$service}->[2] += $body_bytes_sent; ## body_bytes_sent
  }
}

sub add_aggregate_data_string{
  my ($aggr_data, $start_time, $period) = @_;
  return unless $start_time;
  my $str = '';
  my $end_time = $strp->parse_datetime($start_time);
  $end_time->add("${period}s" => 1);
  $end_time = $end_time->strftime('%d/%b/%Y:%H:%M:%S %z');
  for my $ip (keys %{$aggr_data->{$period}}) {
    for my $service (keys %{$aggr_data->{$period}->{$ip}}){
      my $restrictions = sprintf(" WHERE period_start_date='%s' "
                      ."AND period_level='%s' "
                      ."AND %s "
                      ."AND %s ", $start_time, $period, sql_equal_statement('ip',$ip), sql_equal_statement('service_id', $service));
      $str .= sprintf("UPDATE log_ip_aggr SET cnt_requests = cnt_requests + %d, cnt_units = cnt_units + %d, cnt_body_bytes_sent = cnt_body_bytes_sent + %d "
                      ."%s;\n", @{$aggr_data->{$period}->{$ip}->{$service}}, $restrictions);
      $str .= sprintf("INSERT INTO log_ip_aggr(period_start_date, period_end_date, period_level, ip, service_id, cnt_requests, cnt_units, cnt_body_bytes_sent)"
                      ."SELECT '%s', '%s', '%s', "
                      ."%s, %s, %d, %d, %d "
                      ."WHERE NOT EXISTS (SELECT 1 FROM log_ip_aggr %s);\n",
                      $start_time, $end_time, $period,
                      ($ip eq '\N')?"NULL":"'$ip'",
                      ($service eq '\N')?"NULL":"'$service'",
                      @{$aggr_data->{$period}->{$ip}->{$service}},
                      $restrictions),
    }
  }
  return $str;
}

sub sql_equal_statement{
  my ($field,$value) = @_;
  return $value eq '\N' ? "$field IS NULL" : sprintf("%s='%s'",$field,$value);
}